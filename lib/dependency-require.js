var nodePath = require('path');
var raptorModulesUtil = require('raptor-modules/util');
var getPathInfo = raptorModulesUtil.getPathInfo;
var extend = require('raptor-util/extend');
var ok = require('assert').ok;
var equal = require('assert').equal;
var VAR_REQUIRE_PROCESS = 'process=require("process")';
var moduleRoot = nodePath.join(__dirname, '../');
var inspectCache = require('./inspect-cache');
var Deduper = require('./util/Deduper');

var CLIENT_OPTIMIZER_JSON_PATH = require.resolve('raptor-modules/client/optimizer.json');

function buildAsyncInfo(path, asyncBlocks, lassoContext) {
    if (asyncBlocks.length === 0) {
        return null;
    }

    var key = 'require-async|' + path;

    var asyncInfo = lassoContext.data[key];

    if (!lassoContext.data[key]) {

        var asyncMeta = {};

        asyncBlocks.forEach(function(asyncBlock) {
            var uniqueId = lassoContext.uniqueId();
            var name = asyncBlock.name = '_' + uniqueId;
            asyncMeta[name] = asyncBlock.dependencies;
        });

        asyncInfo = lassoContext.data[key] = {
            asyncMeta: asyncMeta,
            asyncBlocks: asyncBlocks
        };
    }

    return asyncInfo;
}

function create(config, lasso) {
    config = config || {};
    var globals = config.globals;
    var resolver = config.resolver;

    var readyDependency = lasso.dependencies.createDependency({
        type: 'commonjs-ready',
        inline: 'end'
    }, __dirname);

    var clientDependency = lasso.dependencies.createDependency({
        type: 'package',
        path: CLIENT_OPTIMIZER_JSON_PATH
    }, __dirname);

    var processDependency = null;
    function getProcessDependency() {
        if (!processDependency) {
            processDependency = lasso.dependencies.createDependency({
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
            builtin: 'boolean'
        },

        init: function(lassoContext, callback) {
            var options;
            var _this = this;

            // "done" is called after _resolved has been set.
            // Here we need to set properties that uniquely
            // identify the dependency so that "calculateKeyFromProps"
            // works as expected.
            // In particular, we need to set "resolvedPath" and
            // "dependencyType" which will be in the _resolved object.
            function done() {
                var resolved = _this._resolved;

                if (!_this.resolvedPath) {
                    _this.resolvedPath = resolved.filePath;
                }

                if (resolved.dependencyType) {
                    _this.dependencyType = resolved.dependencyType;
                }
                callback();
            }

            if (this.root || config.rootDir) {
                options = {
                    root: this.root || config.rootDir,
                    makeRoot: _this._builtin === true
                };
            }

            if (this._resolved) {
                return done();
            } else if (this.resolvedPath) {
                this._resolved = getPathInfo(this.resolvedPath, options);

                if (this.builtin) {
                    this._resolved = extend({}, this._resolved);
                    this._resolved.builtin = true;
                }
                done();
            } else {
                var from = this.from || this.getParentManifestDir();
                var path = this.path;

                delete this.from;
                delete this.path;

                var fromFile = this.getParentManifestPath();
                resolver.resolveRequire(path, from, fromFile, options, lassoContext, function(err, resolved) {
                    if (err) {
                        return callback(err);
                    }

                    _this._resolved = resolved;
                    done();
                });
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

        getDependencies: function(lassoContext, callback) {
            ok(lassoContext, '"lassoContext" argument expected');

            var _this = this;
            var requireHandler;

            // the array of dependencies that we will be returning
            var dependencies = [];
            var deduper = new Deduper(lassoContext, dependencies);

            var resolved = this._resolved;
            var run = this.run === true;
            var wait = this.wait !== false;
            var root = this.root;
            var isDir = resolved.isDir;

            function getRequireHandler() {
                var reader = _this._requireReader;
                var getLastModified = _this._requireGetLastModified;
                var object = _this._requireIsObject;

                if (!reader) {
                    // Use the file extension to get the information for the require
                    var extension = nodePath.extname(resolved.filePath);
                    if (extension) {
                        extension = extension.substring(1); // Remove the leading dot
                    }

                    var requireHandler = lassoContext.dependencyRegistry.getRequireHandler(resolved.filePath, lassoContext);

                    if (!requireHandler) {
                        return null;
                    }

                    reader = requireHandler.reader;
                    getLastModified = requireHandler.getLastModified;
                    object = requireHandler.object === true;
                }

                var transforms = config.transforms;

                var transformedReader;

                if (transforms) {
                    transformedReader = function () {
                        var inStream = reader();
                        return transforms.apply(resolved.filePath, inStream, lassoContext);
                    };
                } else {
                    transformedReader = reader;
                }

                return {
                    reader: transformedReader,
                    getLastModified: getLastModified,
                    object: object
                };
            }

            function getDependenciesFromInspected(err, inspected) {
                if (err) {
                    return callback(err);
                }

                var dep = resolved.dep;
                var main = resolved.main;
                var remap = resolved.remap;
                var defDependency;
                var runDependency;
                var mainRequire;
                var requires; // the requires that were read from inspection (may remain undefined if no inspection result)
                var asyncMeta;
                var asyncBlocks;

                if (inspected && inspected.asyncBlocks && inspected.asyncBlocks.length) {
                    var asyncInfo = buildAsyncInfo(resolved.filePath, inspected.asyncBlocks, lassoContext);
                    if (asyncInfo) {
                        asyncBlocks = asyncInfo.asyncBlocks;
                        asyncMeta = asyncInfo.asyncMeta;
                    }
                }

                // Include client module system if needed and we haven't included it yet
                if (config.includeClient !== false) {
                    deduper.addClient(clientDependency);
                }

                if (!lassoContext.isAsyncBundlingPhase()) {
                    // Add a dependency that will trigger all of the deferred
                    // run modules to run once all of the code has been loaded
                    // for the page
                    deduper.addReady(readyDependency);
                }

                if (main) {
                    // require was for a directory with a package.json that had a "main" property
                    mainRequire = {
                        type: 'require',
                        resolvedPath: main.filePath
                    };

                    if (resolved.builtin) {
                        mainRequire.builtin = true;
                    }

                    // the default is to NOT run
                    if (run === true) {
                        mainRequire.run = true;
                    }

                    // the default is to wait
                    if (wait === false) {
                        mainRequire.wait = false;
                    }

                    if (root) {
                        mainRequire.root = root;
                    }

                    deduper.addMain({
                        type: 'commonjs-main',
                        dir: resolved.realPath,
                        main: main.path,
                        _sourceFile: main.filePath
                    });
                } else {
                    // require was for a source file
                    var additionalVars;
                    ok(inspected,'inspected should not be null');

                    requires = inspected.requires;

                    if (inspected.processGlobal) {
                        deduper.addProcess(getProcessDependency());
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



                        if (wait === false || config.runImmediately === true) {
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

                    ok(inspected.reader, 'reader expected after inspected');
                    ok(inspected.lastModified, 'lastModified expected after inspected');
                    equal(typeof inspected.lastModified, 'number', 'lastModified should be a number');

                    // Pass along the reader and the lastModified to the def dependency
                    defDependency._requireReader = inspected.reader;
                    defDependency._requireInspected = inspected;
                    defDependency._requireAsyncBlocks = asyncBlocks;

                    defDependency._requireLastModified = inspected.lastModified;

                    // Also check if the directory has an browser.json and if so we should include that as well
                    var lassoJsonPath = nodePath.join(nodePath.dirname(resolved.filePath), 'browser.json');
                    if (lassoContext.cachingFs.existsSync(lassoJsonPath)) {
                        dependencies.push({
                            type: 'package',
                            path: lassoJsonPath
                        });
                    } else {
                        lassoJsonPath = nodePath.join(nodePath.dirname(resolved.filePath), 'optimizer.json');
                        if (lassoContext.cachingFs.existsSync(lassoJsonPath)) {
                            dependencies.push({
                                type: 'package',
                                path: lassoJsonPath
                            });
                        }
                    }

                    var defGlobals = globals ? globals[resolved.filePath] : null;

                    if (defGlobals) {
                        defDependency.globals = defGlobals;
                    }

                    // Include all additional dependencies (these were the ones found in the source code)
                    if (requires && requires.length) {
                        requires.forEach(function(inspectedRequire) {
                            var inspectedResolved = inspectedRequire.resolved;

                            if (inspectedResolved.remap) {
                                deduper.addRemap(extend({
                                    type: 'commonjs-remap',
                                    _sourceFile: inspectedResolved.filePath
                                }, inspectedResolved.remap));
                            }

                            deduper.addRequire({
                                type: 'require',
                                _resolved: inspectedResolved
                            });
                        });
                    }
                }

                if (dep) {
                    deduper.addDep(extend({
                        type: 'commonjs-dep',
                        _sourceFile: main ? main.filePath : resolved.filePath
                    }, dep));
                }

                if (remap) {
                    // add remap metadata
                    deduper.addRemap(extend({
                        type: 'commonjs-remap',
                        _sourceFile: resolved.filePath
                    }, remap));
                }

                if (main) {
                    // add dependency to require the main source file
                    deduper.addRequire(mainRequire);
                }

                if (defDependency) {
                    deduper.addDef(defDependency);

                    // Do we also need to add dependency to run the dependency?
                    if (runDependency) {
                        deduper.addRun(runDependency);
                    }
                }

                if (asyncMeta) {
                    var resolvedManifest = {
                        dependencies: dependencies,
                        async: asyncMeta,
                        dirname: nodePath.dirname(resolved.filePath),
                        filename: resolved.filePath
                    };

                    callback(null, resolvedManifest);
                } else {
                    callback(null, dependencies);
                }
            }

            if (isDir) {
                getDependenciesFromInspected(null, null);
            } else {
                if (resolved.dependencyType) {
                    // The required module is not actually a Node.js-style JavaScript module. We'll
                    // just add it it to the dependency graph
                    return callback(null, [{type: resolved.dependencyType, path: resolved.filePath}]);
                }

                requireHandler = getRequireHandler();
                if (!requireHandler) {
                    // This is not really a dependency that compiles down to a CommonJS module
                    // so just add it to the dependency graph
                    return callback(null, [resolved.filePath]);
                }

                inspectCache.inspectCached(
                    resolved.filePath,
                    requireHandler.reader,
                    requireHandler.getLastModified,
                    lassoContext,
                    config,
                    function(err, inspected) {
                        if (err) {
                            return callback(err);
                        }

                        var options;

                        if (_this.root || config.rootDir) {
                            options = {
                                root: _this.root || config.rootDir,
                                makeRoot: resolved.builtin === true
                            };
                        }

                        var fromFile = resolved.filePath;
                        var fromDir = nodePath.dirname(fromFile);

                        resolver.resolveInspectedRequires(
                            inspected,
                            fromDir,
                            fromFile,
                            resolved.builtin,
                            options,
                            lassoContext,
                            getDependenciesFromInspected);
                    });
            }

        }
    };
}

exports.create = create;
