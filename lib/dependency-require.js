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
var builtins = require('./builtins');

var INSPECT_CACHE_CONFIG = {
    store: 'disk',
    encoding: 'utf8',
    valueType: 'json'
};

var TRANSFORMED_CACHE_CONFIG = {
    store: 'disk',
    singleFile: false,
    encoding: 'utf8'
};

function Transforms(transforms) {
    this.names = new Array(transforms.length);

    this._transforms = transforms;
    
    for (var i=0, len=transforms.length; i<len; i++) {

        var transformFunc = transforms[i];

        if (typeof transformFunc === 'string') {
            this.names[i] = transformFunc;
            transforms[i] = transformFunc = require(transformFunc);
        }
    }

    this.id = this.names.join(',');
}

Transforms.prototype.apply = function(path, inStream) {
    var transforms = this._transforms;

    var out = inStream;

    for (var i=0, len=transforms.length; i<len; i++) {
        var transformFunc = transforms[i];
        if (logger.isDebugEnabled()) {
            logger.debug('Applying transform ' + this.names[i]);
        }
        out = out.pipe(transformFunc(path));
    }

    return out;
};

function inspectSource(dependency, resolved, optimizerContext, config) {

    if (resolved.isDir) {
        return raptorPromises.resolved();
    }

    var inspectModule = require('./inspect-module');
    var eventStream = require('event-stream');

    var path = resolved.filePath;
    var dependencyReader = dependency._reader;

    
    var debugEnabled = logger.isDebugEnabled();

    // Inspect and, possibly, transform input source code
    function doInspect() {

        if (debugEnabled) {
            logger.debug('Inspect source for ' + path);
        }

        // do we need to apply any transforms?
        var transforms = config.transforms;

        return raptorPromises.makePromise()

            // read the source code
            .then(function() {
                var deferred = raptorPromises.defer();

                // read in the source code
                var inStream = requireReader.stream(path, optimizerContext, dependencyReader);
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
                    inStream = transforms.apply(path, inStream);
                } else {
                    if (debugEnabled) {
                        logger.debug('No require transforms');
                    }
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
                var inspect = inspectModule(src, optimizerContext.uniqueId, path);

                if (debugEnabled) {
                    logger.debug('Inspection of ' + path + ': ' + JSON.stringify({
                        requires: inspect.requires,
                        async: inspect.async,
                        transformed: inspect.transformed
                    }));
                }

                // We'll return the "inspectModule" result to fulfill the promise
                // but before we do that we need to add a little more information

                // the source was modified if transforms occurred or if the inspectModule
                // function made changes
                inspect.transformed = !!(inspect.modified || transforms);

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
    if (!optimizerContext || !optimizerContext.cache) {
        // FIXME: When will optimizer context not be provided????
        return doInspect().then(function(inspect) {
            inspect.reader = function() {
                resumer().queue(inspect.code).end();
            };
            return inspect;
        });
    }
    
    var cacheKey = path;
    var projectRootDir = config.rootDir || raptorModulesUtil.getProjectRootDir(path);
    if (path.startsWith(projectRootDir)) {
        cacheKey = '$APP_ROOT' + cacheKey.substring(projectRootDir.length);
    }
    
    var deferred = raptorPromises.defer();
    
    // determined the last modified of the source file that we are inspecting
    optimizerContext.getFileLastModified(path, function(err, lastModified) {

        var transformsId = config.transforms ? config.transforms.id : '';

        // get the inspect cache
        var inspectCache = optimizerContext.cache.getCacheByName(nodePath.join('raptor-optimizer-require/inspect', transformsId), INSPECT_CACHE_CONFIG);
        var transformedCache = optimizerContext.cache.getCacheByName(nodePath.join('raptor-optimizer-require/transformed', transformsId), TRANSFORMED_CACHE_CONFIG);
        var reader;
        var code;

        function builder(callback) {
            doInspect().then(function(inspect) {

                if (debugEnabled) {
                    logger.debug('Inspect source completed for ' + path);
                }

                // we had to read in the source code so create a read stream that simply
                // returns the code that we read
                reader = function() {
                    if (debugEnabled) {
                        logger.debug('Reader invoked. Created stream for code at ' + path + '. Number of characters: ' + inspect.code.length);
                    }

                    return resumer().queue(inspect.code).end();
                };

                code = inspect.code;
                
                // provide the callback with the value for caching (does not include reader)
                callback(null, {
                    requires: inspect.requires,
                    async: inspect.async,
                    processGlobal: inspect.processGlobal,
                    transformed: inspect.transformed
                });
            }).catch(function(err) {
                callback(err);
            });
        }
        
        // try to read inspect result from cache
        inspectCache.get(cacheKey, {
            lastModified: lastModified,
            builder: builder
        }, function(err, inspect) {
            
            if (err) {
                logger.error('Error inspecting source', err);
                // error happened in builder so reject the promise
                return deferred.reject(err);
            }
            

            if (debugEnabled) {
                logger.debug('Inspection result for ' + path + ': ' + JSON.stringify(inspect));
            }

            if (reader !== undefined) {
                // NOTE: reader variable is assigned by the builder function
                // before this callback was invoked

                if (debugEnabled) {
                    logger.debug('Cache miss for key "' + cacheKey + '".');
                }

                if (inspect.transformed) {
                    // If we got here then there was a cache miss and source was inspected
                    // and optionally transformed
                    transformedCache.put(cacheKey, code, {
                        lastModified: lastModified
                    });
                }

                return deferred.resolve({
                    requires: inspect.requires,
                    async: inspect.async,
                    processGlobal: inspect.processGlobal,
                    reader: reader
                });
            }
            
            // If we got here then there was a cache hit for the inspect result but we still need to
            // create a reader for the source file or the transformed version of it
            if (!inspect.transformed) {
                // The source code was not transformed so return a reader for the original source file
                if (debugEnabled) {
                    logger.debug('Cache hit for key "' + cacheKey + '". File was not tranformed');
                }
                return deferred.resolve({
                    requires: inspect.requires,
                    async: inspect.async,
                    processGlobal: inspect.processGlobal,
                    reader: function() {
                        return requireReader.stream(path, optimizerContext);
                    }
                });
            }

            // get a read stream to the transformed file in the cache
            transformedCache.getReadStream(cacheKey, {
                builder: function(callback) {
                    builder(function(err, cacheEntry) {

                        logger.warn('Cache hit for inspected source with key "' + cacheKey + '". Cache miss for transformed file.');
                        inspect = cacheEntry;

                        // NOTE: reader variable is assigned by the builder function
                        // before this callback was invoked
                        callback(err, reader);
                    });
                }
            }, function(err, readStream) {
                if (err) {
                    logger.error('Error inspecting source', err);
                    return deferred.reject(err);
                }

                deferred.resolve({
                    requires: inspect.requires,
                    async: inspect.async,
                    processGlobal: inspect.processGlobal,
                    reader: function() {
                        return readStream;
                    }
                });
            });
        });
    });
    
    return deferred.promise;
}

function create(config) {
    config = config || {};

    var transforms;
    if (config.transforms) {
        if (config.transforms.length > 0) {
            config.transforms = transforms = new Transforms(config.transforms);
        } else {
            config.transforms = undefined;
        }
    }

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

                    // Check if it is a builtin module ("path", etc.)
                    if (this.path && builtins[this.path]) {
                        this._resolved = builtins[this.path];
                    } else {
                        var inFile = this._inspectedFile || this.getParentManifestPath();
                        throw createError(new Error('Unable to resolve require for dependency ' + this.toString() + ' referenced in "' + inFile + '". Exception: ' + e), e);
                    }
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

        getDependencies: function(optimizerContext) {
            ok(optimizerContext, '"optimizerContext" argument expected');

            var resolved = this._resolved;
            var run = this.run === true;
            var root = this.root;
            
            return inspectSource(this, resolved, optimizerContext, config).then(function(inspect) {
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
