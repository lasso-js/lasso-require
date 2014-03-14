var nodePath = require('path');
var raptorModulesUtil = require('raptor-modules/util');
var getPathInfo = raptorModulesUtil.getPathInfo;
var resolveRequire = require('raptor-modules/resolver').resolveRequire;
var extend = require('raptor-util').extend;
var fs = require('fs');
var logger = require('raptor-logging').logger(module);
var ok = require('assert').ok;
var thenFS = require('then-fs');
var VAR_REQUIRE_PROCESS = 'process=require("process")';
var raptorPromises = require('raptor-promises');
var invokeReader = require('./invoke-reader');
var moduleRoot = nodePath.join(__dirname, '../');
var clientOptimizerPackagePath = require.resolve('raptor-modules/client/optimizer.json');
var eventStream = require('event-stream');
var resumer = require('resumer');
var inspectModule = require('./inspect-module');

function transform(path, inStream, config) {
    var transforms = config.transforms;
    if (!transforms || !transforms.length) {
        return inStream;
    }

    var out = inStream;

    for (var i=0, len=transforms.length; i<len; i++) {

        var transformFunc = transforms[i];

        if (typeof transformFunc === 'string') {
            transformFunc = require(transformFunc);
        }

        out = out.pipe(transformFunc(path));
    }

    return out;
}

function lastModified(path) {
    var promise = thenFS.stat(path).then(function(stat) {
            return stat.mtime.getTime();
        });

    return raptorPromises.resolved(promise);
}

function inspectSource(resolved, context, reader, config) {
    if (resolved.isDir) {
        return raptorPromises.resolved();
    }

    var path = resolved.filePath;

    function doInspect() {
        return raptorPromises.makePromise()
            .then(function() {
                var deferred = raptorPromises.defer();

                var inStream = invokeReader.stream(path, context, reader);

                var src = '';
                var through = eventStream.through(
                    function write(data) {
                        src += data;
                    },
                    function end() {
                        deferred.resolve(src);
                    });

                through.on('error', function(e) {
                    deferred.reject(e);
                });

                transform(path, inStream, config).pipe(through);

                return deferred.promise;
            })
            .then(function(src) {
                return inspectModule(src, context.uniqueId);
            });
    }
    
    if (context && context.cache) {
        var cacheKey = path;
        var projectRootDir = config.rootDir || raptorModulesUtil.getProjectRootDir(path);
        if (path.startsWith(projectRootDir)) {
            cacheKey = "$APP_ROOT" + cacheKey.substring(projectRootDir.length);
        }

        var cache = context.cache.getCache('requires');

        return lastModified(path)
            .then(function(lastModified) {
                return cache.get(cacheKey, {
                    lastModified: lastModified,
                    builder: function() {
                        return doInspect();
                    }
                });
            });
    } else {
        return doInspect();
    }

    
}

function create(config) {
    config = config || {};

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
            
            this._resolved = this.resolvedPath ? 
                getPathInfo(this.resolvedPath, options) :
                resolveRequire(this.path, this.from, options);
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

        getAsyncPathInfo: function() {
            return {
                path: this._resolved.filePath,
                alias: this.path
            };
        },

        getDependencies: function(context) {
            ok(context, '"context" argument expected');

            var resolved = this._resolved;
            var run = this.run === true;
            var root = this.root;

            return inspectSource(resolved, context, this._reader, config)
                .then(function(inspect) {
                    var requires;
                    var processRequired = false;
                    var reader;

                    if (inspect) {
                        requires = inspect.requires;
                        processRequired = inspect.processGlobal;
                        reader = function() {
                            return resumer().queue(inspect.code).end();
                        };
                        // reader = _this._reader;
                        // console.log('' + reader);
                    }

                    var dependencies = [];

                    var dep = resolved.dep;
                    var main = resolved.main;
                    var remap = resolved.remap;

                    if (config.includeClient !== false) {
                        dependencies.push({
                            type: 'package',
                            path: clientOptimizerPackagePath
                        });    
                    }

                    // Add a dependency that will trigger all of the deferred
                    // run modules to run once all of the code has been loaded
                    // for the page
                    dependencies.push({
                        type: 'commonjs-ready',
                        inline: 'end'
                    });

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

                        // Include all additional dependencies
                        if (requires && requires.length) {
                            var from = nodePath.dirname(resolved.filePath);

                            if (logger.isDebugEnabled()) {
                                logger.debug('Requires found for "' + resolved.filePath + '":\n   [' + requires.join(', ') + '] - FROM: ' + from + '\n\n');
                            }

                            requires.forEach(function(reqDependency) {
                                dependencies.push({
                                    type: 'require',
                                    path: reqDependency,
                                    from: from
                                });
                            });
                        }
                        
                        var additionalVars;
                        if (processRequired) {
                            additionalVars = [VAR_REQUIRE_PROCESS];
                        }

                        var defDependency;

                        if (run) {
                            defDependency = {
                                type: 'commonjs-run',
                                path: resolved.logicalPath,
                                _file: resolved.filePath
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
                        if (fs.existsSync(optimizerJsonPath)) {
                            dependencies.push({
                                type: 'package',
                                path: optimizerJsonPath
                            });
                        }

                        // Also check if the directory has an optimizer.json and if so we should include that as well
                        optimizerJsonPath = nodePath.join(nodePath.dirname(resolved.filePath), 'optimizer.json');
                        if (fs.existsSync(optimizerJsonPath)) {
                            dependencies.push({
                                type: 'package',
                                path: optimizerJsonPath
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
                            async: inspect ? inspect.async : null
                        };
                    } else {
                        return dependencies;
                    }
                });
            
        }
    };
}

exports.create = create;
