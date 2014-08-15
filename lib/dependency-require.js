var nodePath = require('path');
var raptorModulesUtil = require('raptor-modules/util');
var getPathInfo = raptorModulesUtil.getPathInfo;
var resolveRequire = require('raptor-modules/resolver').resolveRequire;
var extend = require('raptor-util/extend');
var logger = require('raptor-logging').logger(module);
var ok = require('assert').ok;
var VAR_REQUIRE_PROCESS = 'process=require("process")';
var requireReader = require('./require-reader');
var moduleRoot = nodePath.join(__dirname, '../');
var CLIENT_OPTIMIZER_JSON_PATH = require.resolve('raptor-modules/client/optimizer.json');
var resumer = require('resumer');
var createError = require('raptor-util/createError');
var builtins = require('./builtins');

function inspectSource(dependency, resolved, optimizerContext, config, callback) {
    if (resolved.isDir) {
        // ignore requires that were for a directory (which probably had a package.json)
        return callback();
    }

    var inspectModule = require('./inspect-module');
    var eventStream = require('event-stream');

    var path = resolved.filePath;

    var dependencyReader = dependency._reader;

    
    var debugEnabled = logger.isDebugEnabled();

    // Inspect and, possibly, transform input source code
    function doInspect(callback) {
        if (debugEnabled) {
            logger.debug('Inspect source for ' + path);
        }

        // do we need to apply any transforms?
        var transforms = config.transforms;

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

                callback(null, inspect);
            });

        through.on('error', function(err) {
            callback(err);
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
    }
    
    var cacheKey = path;
    var projectRootDir = config.rootDir || raptorModulesUtil.getProjectRootDir(path);
    if (path.startsWith(projectRootDir)) {
        cacheKey = '$APP_ROOT' + cacheKey.substring(projectRootDir.length);
    }
    
    // determined the last modified of the source file that we are inspecting
    optimizerContext.getFileLastModified(path, function(err, lastModified) {
        var transformsId = config.transforms ? '/' + config.transforms.id : '';

        // Get or create the required caches
        var inspectCache = optimizerContext.attributes['raptor-optimizer-require/inspect'];
        if (!inspectCache) {
            inspectCache = optimizerContext.attributes['raptor-optimizer-require/inspect'] = optimizerContext.cache.getCache(
                    'raptor-optimizer-require/inspect' + transformsId, // <-- Unique cache name based on the set of enabled require transforms
                    'raptor-optimizer-require/inspect');               // <-- Name of the cache configuration to use
        }

        var transformedCache = optimizerContext.attributes['raptor-optimizer-require/transformed'];
        if (!transformedCache) {
            transformedCache = optimizerContext.attributes['raptor-optimizer-require/transformed'] = optimizerContext.cache.getCache(
                    'raptor-optimizer-require/transformed' + transformsId, // <-- Unique cache name based on the set of enabled require transforms
                    'raptor-optimizer-require/transformed');               // <-- Name of the cache configuration to use
        }

        var reader;
        var code;

        function builder(callback) {
            doInspect(function(err, inspect) {
                if (err) {
                    return callback(err);
                }

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
                return callback(err);
            }
            

            if (debugEnabled) {
                logger.debug('Inspection result for ' + path + ': ' + JSON.stringify(inspect));
            }

            // there have been issues with stack size getting too big when inspect cache returns immediately
            // so we only invoke callback immediately if we know that there was a cache miss
            var immediate = false;

            var callbackResponse;

            if (reader !== undefined) {
                // if reader was created then
                immediate = true;

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

                callbackResponse = {
                    requires: inspect.requires,
                    async: inspect.async,
                    processGlobal: inspect.processGlobal,
                    reader: reader
                };
            } else if (inspect.transformed) {
                // If we got here then there was a cache hit for the inspect result but we still need to
                // create a reader for the source file or the transformed version of it
                callbackResponse = {
                    requires: inspect.requires,
                    async: inspect.async,
                    processGlobal: inspect.processGlobal,
                    reader: function() {
                        // get a read stream to the transformed file in the cache
                        return transformedCache.createReadStream(
                            cacheKey,
                            {
                                builder: function(callback) {
                                    builder(function(err, cacheEntry) {

                                        logger.warn('Cache hit for inspected source with key "' + cacheKey + '". Cache miss for transformed file.');
                                        inspect = cacheEntry;

                                        // NOTE: reader variable is assigned by the builder function
                                        // before this callback was invoked
                                        callback(err, reader);
                                    });
                                }
                            });
                    }
                };
            } else {
                // The source code was not transformed so return a reader for the original source file
                if (debugEnabled) {
                    logger.debug('Cache hit for key "' + cacheKey + '". File was not tranformed');
                }
                callbackResponse = {
                    requires: inspect.requires,
                    async: inspect.async,
                    processGlobal: inspect.processGlobal,
                    reader: function() {
                        return requireReader.stream(path, optimizerContext);
                    }
                };
            }

            if (immediate) {
                callback(null, callbackResponse);
            } else {
                process.nextTick(function() {
                    callback(null, callbackResponse);
                });
            }
        });
    });
}

function defKeyFunc(config) {
    return config.path + '|' + config.run + '|' + config.wait;
}

function depKeyFunc(config) {
    return config.parentPath + '|' + config.childName + '|' + config.childVersion + '|' + config.remap;
}

function mainKeyFunc(config) {
    return config.main + '|' + config.dir;
}

function remapKeyFunc(config) {
    return config.from + '|' + config.to;
}

function requireKeyFunc(config) {
    return config.path + '|' + config.resolvedPath + '|' + config.from + '|' + config.async + '|' + config.root + '|' + config.run + '|' + config.wait;
}

function addDependency(config, dependencies, keyFunc, addedDependencies) {
    var key = keyFunc(config);

    if (!addedDependencies[key]) {
        addedDependencies[key] = true;
        dependencies.push(config);
    }
}

function create(config, optimizer) {
    config = config || {};

    

    var globals = config.globals;

    var readyDependency = optimizer.dependencies.createDependency({
        type: 'commonjs-ready',
        inline: 'end'
    }, __dirname);

    var clientDependency = optimizer.dependencies.createDependency({
        type: 'package',
        path: CLIENT_OPTIMIZER_JSON_PATH
    }, __dirname);

    var processDependency = null;
    function getProcessDependency() {
        if (!processDependency) {
            processDependency = optimizer.dependencies.createDependency({
                    type: 'require',
                    path: 'process',
                    from: __dirname,
                    root: moduleRoot // Simulate a top-level installed module
                }, __dirname);
        }
        return processDependency;
    }

    

    return {
        properties: {
            path: 'string',
            resolvedPath: 'string',
            from: 'string',
            async: 'string',
            root: 'string',
            run: 'boolean',
            wait: 'boolean',
            reader: 'function'
        },

        // calculateKey: function(callback) {
        //     return 'require: ' + this._resolved.filePath;
        // },

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
                if (e.moduleNotFound || e.code === 'ENOENT') {

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

        getDependencies: function(optimizerContext, callback) {
            ok(optimizerContext, '"optimizerContext" argument expected');

            // The require context key
            var requireContextKey = 'dependency-require';
            
            /*
             * NOTE: The use of "phaseAttributes" was necessary because we want to keep a cache that is independent of
             * for each phase of the optimization process. The optimization is separated into phases such as "app-bundle-mappings",
             * "page-bundle-mappings", "async-page-bundle-mappings", etc. We use the "requireContext" to prevent adding the same
             * require dependencies over and over again.
             */
            var requireContext = optimizerContext.phaseAttributes[requireContextKey] || (optimizerContext.phaseAttributes[requireContextKey] = {
                addedDefDependencies: {},
                addedDepDependencies: {},
                addedMainDependencies: {},
                addedRemapDependencies: {},
                addedRequireDependencies: {},
                addedPackageDependencies: {}
            });

            var addedDefDependencies = requireContext.addedDefDependencies;
            var addedDepDependencies = requireContext.addedDepDependencies;
            var addedMainDependencies = requireContext.addedMainDependencies;
            var addedRemapDependencies = requireContext.addedRemapDependencies;
            var addedRequireDependencies = requireContext.addedRequireDependencies;

            var resolved = this._resolved;
            var run = this.run === true;
            var wait = this.wait !== false;
            var root = this.root;

            inspectSource(this, resolved, optimizerContext, config, function(err, inspect) {
                if (err) {
                    return callback(err);
                }

                // the array of dependencies that we will be returning
                var dependencies = [];

                var dep = resolved.dep;
                var main = resolved.main;
                var remap = resolved.remap;
                var defDependency;


                var mainRequire;

                // the requires that were read from inspection (may remain undefined if no inspection result)
                var requires;

                if (resolved.isDir) {
                    ok(main, 'resolved path is a directory, but it has no main file: ' + require('util').inspect(resolved));
                }

                // Include client module system if needed and we haven't included it yet
                if (config.includeClient !== false && !requireContext.clientIncluded) {
                    dependencies.push(clientDependency);

                    requireContext.clientIncluded = true;
                }

                if (!requireContext.readyIncluded && !optimizerContext.isAsyncBundlingPhase()) {
                    // Add a dependency that will trigger all of the deferred
                    // run modules to run once all of the code has been loaded
                    // for the page
                    dependencies.push(readyDependency);
                    requireContext.readyIncluded = true;
                }

                if (main) {
                    // require was for a directory with a package.json that had a "main" property
                    mainRequire = {
                        type: 'require',
                        resolvedPath: main.filePath
                    };

                    if (run) {
                        mainRequire.run = true;
                    }

                    if (wait === false) {
                        mainRequire.wait = false;
                    }

                    if (root) {
                        mainRequire.root = root;
                    }

                    // add the metadata for the main file for the package.json
                    addDependency({
                        type: 'commonjs-main',
                        dir: resolved.realPath,
                        main: main.path,
                        _sourceFile: main.filePath
                    }, dependencies, mainKeyFunc, addedMainDependencies);
                } else {
                    // require was for a source file
                    var reader;
                    var additionalVars;

                    if (inspect) {
                        requires = inspect.requires;
                        reader = inspect.reader;

                        if (inspect.processGlobal) {
                            // Include "process" if not included and we haven't included it yet
                            if (!requireContext.processIncluded) {
                                dependencies.push(getProcessDependency());
                                requireContext.processIncluded = true;
                            }

                            additionalVars = [VAR_REQUIRE_PROCESS];
                        }
                    }

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

                    if (wait === false) {
                        defDependency.wait = false;
                    }

                    if (additionalVars) {
                        defDependency._additionalVars = additionalVars;
                    }

                    if (reader) {
                        defDependency._reader = reader;
                    }

                    // Also check if the directory has an optimizer.json and if so we should include that as well
                    var optimizerJsonPath = nodePath.join(nodePath.dirname(resolved.filePath), 'optimizer.json');

                    if (optimizerContext.cachingFs.existsSync(optimizerJsonPath)) {
                        dependencies.push({
                            type: 'package',
                            path: optimizerJsonPath
                        });
                    }

                    var defGlobals = globals ? globals[resolved.filePath] : null;

                    if (defGlobals) {
                        defDependency.globals = defGlobals;
                    }

                    // Include all additional dependencies (these were the ones found in the source code)
                    if (requires && requires.length) {
                        var from = nodePath.dirname(resolved.filePath);

                        // if (logger.isDebugEnabled()) {
                        //     logger.debug('Requires found for "' + resolved.filePath + '":\n   [' + requires.join(', ') + '] - FROM: ' + from + '\n\n');
                        // }

                        requires.forEach(function(reqDependency) {
                            addDependency({
                                type: 'require',
                                path: reqDependency,
                                from: from,
                                _inspectedFile: resolved.filePath
                            }, dependencies, requireKeyFunc, addedRequireDependencies);
                        });
                    }
                }

                if (dep) {
                    // add dependency metadata
                    addDependency(extend({
                        type: 'commonjs-dep',
                        _sourceFile: main ? main.filePath : resolved.filePath
                    }, dep), dependencies, depKeyFunc, addedDepDependencies);
                }

                if (remap) {
                    // add remap metadata
                    addDependency(extend({
                        type: 'commonjs-remap',
                        _sourceFile: resolved.filePath
                    }, remap), dependencies, remapKeyFunc, addedRemapDependencies);
                }

                if (main) {
                    // add dependency to require the main source file
                    addDependency(mainRequire, dependencies, requireKeyFunc, addedRequireDependencies);
                }

                if (defDependency) {
                    addDependency(defDependency, dependencies, defKeyFunc, addedDefDependencies);
                }

                if (inspect && inspect.async) {
                    callback(null, {
                        dependencies: dependencies,
                        async: inspect.async
                    });
                } else {
                    callback(null, dependencies);
                }
            });

        }
    };
}

exports.create = create;
