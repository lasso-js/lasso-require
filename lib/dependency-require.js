var nodePath = require('path');
var raptorModulesUtil = require('raptor-modules/util');
var getPathInfo = raptorModulesUtil.getPathInfo;
var resolveRequire = require('raptor-modules/resolver').resolveRequire;
var extend = require('raptor-util/extend');
var ok = require('assert').ok;
var equal = require('assert').equal;

var VAR_REQUIRE_PROCESS = 'process=require("process")';
var moduleRoot = nodePath.join(__dirname, '../');
var CLIENT_OPTIMIZER_JSON_PATH = require.resolve('raptor-modules/client/optimizer.json');
var createError = require('raptor-util/createError');
var builtins = require('./builtins');
var inspect = require('./inspect');

function defKeyFunc(config) {
    return config.path;
}

function runKeyFunc(config) {
    return config.path + '|' + config.wait;
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
            reader: 'function',
            lastModified: 'function'
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

            this._lastModified = this._lastModified || this.lastModified;
            delete this.lastModified;

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
            var _this = this;
            var requireHandler;
            var inFile = this._inspectedFile || this.getParentManifestPath() || this.getParentManifestDir();

            /*
             * NOTE: The use of "phaseData" was necessary because we want to keep a cache that is independent of
             * for each phase of the optimization process. The optimization is separated into phases such as "app-bundle-mappings",
             * "page-bundle-mappings", "async-page-bundle-mappings", etc. We use the "requireContext" to prevent adding the same
             * require dependencies over and over again.
             */
            var requireContext = optimizerContext.phaseData[requireContextKey] || (optimizerContext.phaseData[requireContextKey] = {
                addedDefDependencies: {},
                addedRunDependencies: {},
                addedDepDependencies: {},
                addedMainDependencies: {},
                addedRemapDependencies: {},
                addedRequireDependencies: {},
                addedPackageDependencies: {}
            });

            var addedDefDependencies = requireContext.addedDefDependencies;
            var addedRunDependencies = requireContext.addedRunDependencies;
            var addedDepDependencies = requireContext.addedDepDependencies;
            var addedMainDependencies = requireContext.addedMainDependencies;
            var addedRemapDependencies = requireContext.addedRemapDependencies;
            var addedRequireDependencies = requireContext.addedRequireDependencies;

            var resolved = this._resolved;
            var run = this.run === true;
            var wait = this.wait !== false;
            var root = this.root;
            var isDir = resolved.isDir;

            if (isDir && !resolved.main) {
                return callback(new Error('require(' + JSON.stringify(this.path || this.resolvedPath) + ') resolved to a directory at path "' + resolved.filePath + '" which does not have a main file (referenced in "' + inFile + '")'));
            }

            function getRequireHandler() {
                var reader = _this._requireReader;
                var lastModified = _this._requireLastModified;
                var object = _this._requireIsObject;

                if (!reader) {
                    // Use the file extension to get the information for the require
                    var extension = nodePath.extname(resolved.filePath);
                    if (extension) {
                        extension = extension.substring(1); // Remove the leading dot
                    }

                    var requireHandler = optimizerContext.dependencyRegistry.getRequireHandler(resolved.filePath, optimizerContext);

                    if (!requireHandler) {
                        return null;
                    }

                    reader = requireHandler.reader;
                    lastModified = requireHandler.lastModified;
                    object = requireHandler.object === true;
                }

                var transforms = config.transforms;

                var transformedReader;

                if (transforms) {
                    transformedReader = function () {
                        var inStream = reader();
                        return transforms.apply(resolved.filePath, inStream, optimizerContext);
                    };
                } else {
                    transformedReader = reader;
                }

                return {
                    reader: transformedReader,
                    lastModified: lastModified,
                    object: object
                };
            }

            function getDependenciesFromInspect(err, inspect) {
                if (err) {
                    return callback(err);
                }

                // the array of dependencies that we will be returning
                var dependencies = [];

                var dep = resolved.dep;
                var main = resolved.main;
                var remap = resolved.remap;
                var defDependency;
                var runDependency;


                var mainRequire;

                // the requires that were read from inspection (may remain undefined if no inspection result)
                var requires;



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

                    // the default is to NOT run
                    if (run === true) {
                        mainRequire.run = true;
                    }

                    // the default is to wait
                    if (wait === false) {
                        mainRequire = false;
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
                    var additionalVars;
                    ok(inspect,'inspect should not be null');

                    requires = inspect.requires;

                    if (inspect.processGlobal) {
                        // Include "process" if not included and we haven't included it yet
                        if (!requireContext.processIncluded) {
                            dependencies.push(getProcessDependency());
                            requireContext.processIncluded = true;
                        }

                        additionalVars = [VAR_REQUIRE_PROCESS];
                    }

                    if (run) {
                        defDependency = {
                            type: 'commonjs-def',
                            path: resolved.realPath,
                            _file: resolved.filePath
                        };

                        runDependency = {
                            type: 'commonjs-run',
                            path: resolved.logicalPath,
                            _file: resolved.filePath
                        };

                        if (wait === false) {
                            runDependency.wait = false;
                        }
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

                    if (requireHandler.object) {
                        // If true, then the module will not be wrapped inside a factory function
                        defDependency.object = true;
                    }

                    ok(inspect.reader, 'reader expected after inspect');
                    ok(inspect.lastModified, 'lastModified expected after inspect');
                    equal(typeof inspect.lastModified, 'number', 'lastModified should be a number');

                    // Pass along the reader and the lastModified to the def dependency
                    defDependency._requireReader = inspect.reader;
                    defDependency._requireLastModified = inspect.lastModified;

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

                    // Do we also need to add dependency to run the dependency?
                    if (runDependency) {
                        addDependency(runDependency, dependencies, runKeyFunc, addedRunDependencies);
                    }
                }

                if (inspect && inspect.async) {
                    var resolvedManifest = {
                        dependencies: dependencies,
                        async: inspect.async,
                        dirname: nodePath.dirname(resolved.filePath),
                        filename: resolved.filePath
                    };

                    callback(null, resolvedManifest);
                } else {
                    callback(null, dependencies);
                }
            }

            if (isDir) {
                getDependenciesFromInspect(null, null);
            } else {
                requireHandler = getRequireHandler();
                if (!requireHandler) {
                    callback(new Error('Require extension not registered for "' + nodePath.extname(resolved.filePath).substring(1) + '"". Unable to require path "' + resolved.filePath + '" (referenced in "' + inFile + '")'));
                    return;
                }

                inspect.inspectCached(
                    resolved.filePath,
                    requireHandler.reader,
                    requireHandler.lastModified,
                    optimizerContext,
                    config,
                    getDependenciesFromInspect);
            }

        }
    };
}

exports.create = create;
