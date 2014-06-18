var nodePath = require('path');
var raptorModulesUtil = require('raptor-modules/util');
var getPathInfo = raptorModulesUtil.getPathInfo;
var resolveRequire = require('raptor-modules/resolver').resolveRequire;
var extend = require('raptor-util/extend');
var fs = require('fs');
var logger = require('raptor-logging').logger(module);
var ok = require('assert').ok;
var VAR_REQUIRE_PROCESS = 'process=require("process")';
var raptorPromises = require('raptor-promises');
var requireReader = require('./require-reader');
var moduleRoot = nodePath.join(__dirname, '../');
var CLIENT_OPTIMIZER_JSON_PATH = require.resolve('raptor-modules/client/optimizer.json');
var resumer = require('resumer');
var createError = require('raptor-util/createError');
var crypto = require('crypto');
var mkdirp = require('mkdirp');

function generateTransformedFileName(filePath) {

    var pos = filePath.indexOf('.');
    var extension = pos === -1 ? '' : filePath.substring(pos);

    var shasum = crypto.createHash('sha1');
    shasum.update(filePath);
    var checksum = shasum.digest('hex');

    return nodePath.join(checksum + extension);
}

function applyTransforms(path, inStream, transforms) {
    var out = inStream;

    for (var i=0, len=transforms.length; i<len; i++) {

        var transformFunc = transforms[i];

        if (typeof transformFunc === 'string') {
            transforms[i] = transformFunc = require(transformFunc);
        }

        out = out.pipe(transformFunc(path));
    }

    return out;
}

function inspectSource(dependency, resolved, context, config) {

    if (resolved.isDir) {
        return raptorPromises.resolved();
    }

    var inspectModule = require('./inspect-module');
    var eventStream = require('event-stream');

    var path = resolved.filePath;
    var reader = dependency._reader;

    function doInspect() {

        // do we need to apply any transforms?
        var transforms = config.transforms && config.transforms.length > 0 ?
            config.transforms : null;

        return raptorPromises.makePromise()

            // read the source code
            .then(function() {
                var deferred = raptorPromises.defer();

                // read in the source code
                var inStream = requireReader.stream(path, context, reader);
                var src = '';
                var through = eventStream.through(
                    function write(data) {
                        src += data;
                    },
                    function end() {
                        if (logger.isDebugEnabled()) {
                            logger.debug('Read ' + path + '.');
                        }
                        deferred.resolve(src);
                    });

                through.on('error', function(e) {
                    deferred.reject(e);
                });

                if (transforms) {
                    // apply transforms
                    inStream = applyTransforms(path, inStream, transforms);
                }

                inStream.pipe(through);

                // return promise for src content (which may or may not be transformed)
                return deferred.promise;
            })

            // then inspect the module
            .then(function(src) {
                // inspectModule will return the following:
                //   modified: Was the source code modified as a result of inspection?
                //   code: The resultant source code (possible different from the input source code)
                //   requires: Array of required dependencies
                //   processGlobal: Is global process needed? (true/false)
                //   async: Array of asynchronous dependencies
                var inspect = inspectModule(src, context.uniqueId, path);

                // We'll return the "inspectModule" result to fulfill the promise
                // but before we do that we massage the result a little bit so that
                // it contains the information that the caller needs.

                // the source was modified if transforms occurred or if the inspectModule
                // function made changes
                inspect.modified = !!(inspect.modified || transforms);

                // we had to read in the source code so create a read stream that simply
                // returns the code that we read
                inspect.reader = function() {
                    return resumer().queue(inspect.code).end();
                };

                return inspect;
            });
    }
    
    /*
     * This function will return a promise to return an object with the following information:
     *   reader: {Function} a function that will be called to return a stream to read the source code
     *   requires: {Array} An array of required dependencies
     *   async: {Array} An array of asynchronous dependencies
     *   processGlobal: {Boolean} Requires global process (true/false)
     */
    if (context && context.cache) {
        var cacheKey = path;
        var projectRootDir = config.rootDir || raptorModulesUtil.getProjectRootDir(path);
        if (path.startsWith(projectRootDir)) {
            cacheKey = '$APP_ROOT' + cacheKey.substring(projectRootDir.length);
        }

        var cacheName = 'requires';

        var cacheConfig = context.cache.getCacheConfig(cacheName);
        if (cacheConfig.disk) {
            cacheConfig.disk.singleFile = true;
        }

        var cache = context.cache.getCache(cacheName, cacheConfig);


        var _lastModified;

        var ts = Date.now();

        return context.getFileLastModified(path)

            .then(function(lastModified) {
                
                _lastModified = lastModified;

                ts = Date.now();
                // See if we have cached metadata for this file path
                return cache.get(cacheKey, {
                    lastModified: lastModified
                });
            })

            .then(function(cacheEntry) {
                if (cacheEntry) {

                    var newReader;

                    // if the cache entry says that the code was transformed then we
                    // need to read the transformed code as well
                    if (cacheEntry.transformedFile) {
                        // does the transformed file exist in the cache directory?
                        var transformedFilePath = nodePath.join(context.cache.getCacheDir(), cacheEntry.transformedFile);
                        if (fs.existsSync(transformedFilePath)) {
                            newReader = function() {
                                return fs.createReadStream(transformedFilePath);
                            };
                        }
                    } else {
                        newReader = reader || function() {
                            return requireReader.stream(path, context);
                        };
                    }

                    if (newReader) {
                        // We found everything that we needed from the cache!
                        return {
                            requires: cacheEntry.requires,
                            async: cacheEntry.async,
                            processGlobal: cacheEntry.processGlobal,
                            reader: newReader
                        };
                    }
                }

                // If we got here then the cache is corrupt or there was a cache miss
                return doInspect().then(function(inspect) {
                    var cacheEntry = {
                        requires: inspect.requires,
                        async: inspect.async,
                        processGlobal: inspect.processGlobal,
                        lastModified: _lastModified
                    };

                    // TODO: Do something like this:
                    //cache.put(cacheKey, dataHolder);

                    if (inspect.modified && inspect.code) {
                        var transformedFile;

                        // create a file name that is hash based on the full path of the file
                        var cachedTransformFileName = generateTransformedFileName(path);

                        // determine the path to directory (which will be relative to the cache directory)
                        var cachedTransformDirname = nodePath.join('transformed', cachedTransformFileName.charAt(0));

                        // determine the path to the cached transform file (which will be relative to the cache directory)
                        cacheEntry.transformedFile = transformedFile = nodePath.join(cachedTransformDirname, cachedTransformFileName);

                        // no find the absolute path to the cache directory for transformed file
                        var absoluteCachedTransformDirname = nodePath.join(context.cache.getCacheDir(), cachedTransformDirname);

                        // TODO: Put a DataHolder or promise in the cache immediately

                        // make sure the directory exists
                        mkdirp(absoluteCachedTransformDirname, function(err) {
                            if (err) {
                                logger.error('Error creating cache directory for transformed file', err);
                                return;
                            }

                            // now get the full absolute file path for file that will contain transformation result
                            var transformedFilePath = nodePath.join(absoluteCachedTransformDirname, cachedTransformFileName);
                            
                            fs.writeFile(transformedFilePath, inspect.code, function(err) {
                                if (err) {
                                    logger.error('Error caching result of transforming "' + path + '".', err);
                                } else {
                                    if (logger.isInfoEnabled()) {
                                        logger.info('Cached transformation of "' + path + '" to "' + transformedFilePath + '"');
                                    }
                                    cache.put(cacheKey, cacheEntry);
                                }
                            });
                        });

                        
                    } else {
                        cache.put(cacheKey, cacheEntry);
                    }

                    return inspect;
                });
            });
    } else {
        return doInspect();
    }
}

function create(config) {
    config = config || {};

    var globals = config.globals;

    return {
        properties: {
            path: 'string',
            resolvedPath: 'string',
            from: 'string',
            async: 'string',
            root: 'string',
            run: 'boolean',
            reader: 'function'
        },

        init: function() {
            if (!this.resolvedPath) {
                this.from = this.from || this.getParentManifestDir();
            }

            this._reader = this._reader || this.reader;
            delete this.reader;

            var options;
            if (this.root || config.rootDir) {
                options = {
                    root: this.root || config.rootDir
                };
            }
            
            try {
                this._resolved = this.resolvedPath ?
                    getPathInfo(this.resolvedPath, options) :
                    resolveRequire(this.path, this.from, options);
            } catch(e) {
                if (e.moduleNotFound) {
                    var inFile = this._inspectedFile || this.getParentManifestPath();
                    throw createError(new Error('Unable to resolve require for dependency ' + this.toString() + ' referenced in "' + inFile + '". Exception: ' + e), e);
                } else {
                    throw e;
                }
            }
            
        },
        
        getDir: function() {
            if (this._resolved.isDir) {
                // Use the directory of the main file as the directory (used for determining how
                // to recurse into modules when building bundles)
                return nodePath.dirname(this._resolved.main.filePath);
            }
            else {
                return nodePath.dirname(this._resolved.filePath);
            }
        },

        getDependencies: function(context) {
            ok(context, '"context" argument expected');

            var resolved = this._resolved;
            var run = this.run === true;
            var root = this.root;

            return inspectSource(this, resolved, context, config).then(function(inspect) {
                var requires;
                var processRequired = false;
                var reader;

                if (inspect) {
                    requires = inspect.requires;
                    processRequired = inspect.processGlobal;
                    reader = inspect.reader;
                }

                var dependencies = [];

                var dep = resolved.dep;
                var main = resolved.main;
                var remap = resolved.remap;

                // Include client module system if needed and we haven't included it yet
                if (config.includeClient !== false) {
                    dependencies.push({
                        type: 'package',
                        path: CLIENT_OPTIMIZER_JSON_PATH
                    });
                }

                // Add a dependency that will trigger all of the deferred
                // run modules to run once all of the code has been loaded
                // for the page
                dependencies.push({
                    type: 'commonjs-ready',
                    inline: 'end'
                });

                // Include "process" if not included and we haven't included it yet
                if (processRequired) {
                    dependencies.push({
                        type: 'require',
                        path: 'process',
                        from: __dirname,
                        root: moduleRoot // Simulate a top-level installed module
                    });
                }

                if (main) {
                    var mainRequire = {
                        type: 'require',
                        resolvedPath: main.filePath
                    };

                    if (run) {
                        mainRequire.run = true;
                    }

                    if (root) {
                        mainRequire.root = root;
                    }

                    dependencies.push(mainRequire);

                    dependencies.push({
                        type: 'commonjs-main',
                        dir: resolved.realPath,
                        main: main.path,
                        _sourceFile: main.filePath
                    });

                    
                } else {
                    
                    var additionalVars;
                    if (processRequired) {
                        additionalVars = [VAR_REQUIRE_PROCESS];
                    }

                    var defDependency;

                    if (run) {
                        defDependency = {
                            type: 'commonjs-def',
                            path: resolved.logicalPath,
                            _file: resolved.filePath,
                            run: true
                        };
                        
                    } else {
                        defDependency = {
                            type: 'commonjs-def',
                            path: resolved.realPath,
                            _file: resolved.filePath
                        };
                    }

                    if (additionalVars) {
                        defDependency._additionalVars = additionalVars;
                    }

                    if (reader) {
                        defDependency._reader = reader;
                    }

                    dependencies.push(defDependency);

                    // Check if the required file has an "-optimizer.json" associated with it
                    var ext = nodePath.extname(resolved.filePath);
                    var optimizerJsonPath = resolved.filePath.slice(0, 0-ext.length) + '-optimizer.json';

                    // TODO: Cache this check?
                    if (fs.existsSync(optimizerJsonPath)) {
                        dependencies.push({
                            type: 'package',
                            path: optimizerJsonPath
                        });
                    }

                    // Also check if the directory has an optimizer.json and if so we should include that as well
                    optimizerJsonPath = nodePath.join(nodePath.dirname(resolved.filePath), 'optimizer.json');

                    // TODO: Cache this check?
                    if (fs.existsSync(optimizerJsonPath)) {
                        dependencies.push({
                            type: 'package',
                            path: optimizerJsonPath
                        });
                    }

                    var defGlobals = globals ? globals[resolved.filePath] : null;

                    if (defGlobals) {
                        defDependency.globals = defGlobals;
                    }

                    // Include all additional dependencies
                    if (requires && requires.length) {
                        var from = nodePath.dirname(resolved.filePath);

                        // if (logger.isDebugEnabled()) {
                        //     logger.debug('Requires found for "' + resolved.filePath + '":\n   [' + requires.join(', ') + '] - FROM: ' + from + '\n\n');
                        // }

                        requires.forEach(function(reqDependency) {
                            dependencies.push({
                                type: 'require',
                                path: reqDependency,
                                from: from,
                                _inspectedFile: resolved.filePath
                            });
                        });
                    }
                }

                if (dep) {
                    dependencies.push(extend({
                        type: 'commonjs-dep',
                        _sourceFile: main ? main.filePath : resolved.filePath
                    }, dep));
                }

                if (remap) {
                    dependencies.push(extend({
                        type: 'commonjs-remap',
                        _sourceFile: resolved.filePath
                    }, remap));
                }

                if (inspect && inspect.async) {
                    return {
                        dependencies: dependencies,
                        async: inspect.async
                    };
                } else {
                    return dependencies;
                }
            });

        }
    };
}

exports.create = create;
