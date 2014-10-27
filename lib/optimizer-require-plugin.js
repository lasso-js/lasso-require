var fs = require('fs');
var dependency_require = require('./dependency-require');
var dependency_commonjs_def = require('./dependency-define');
var dependency_commonjs_run = require('./dependency-run');
var depednency_commonjs_dep = require('./dependency-dep');
var dependency_commonjs_main = require('./dependency-main');
var dependency_commonjs_remap = require('./dependency-remap');
var dependency_commonjs_resolved = require('./dependency-resolved');
var dependency_commonjs_ready = require('./dependency-ready');
var dependency_commonjs_search_path = require('./dependency-search-path');
var Transforms = require('./util/Transforms');
var extend = require('raptor-util').extend;
var resolveRequire = require('raptor-modules/resolver').resolveRequire;

var requireRegExp = /^require\s+(.*)$/;
var requireRunRegExp = /^require-run\s*:\s*(.*)$/;


var defaultGlobals = {
    'jquery': ['$', 'jQuery']
};

module.exports = exports = function plugin(optimizer, config) {
    config = extend({}, config || {});

    config.rootDir = config.rootDir || optimizer.config.getProjectRoot();


    var transforms;
    if (config.transforms) {
        if (config.transforms.length > 0) {
            config.transforms = transforms = new Transforms(config.transforms);
        } else {
            config.transforms = undefined;
        }
    }

    var globals = extend({}, defaultGlobals);
    if (config.globals) {
        extend(globals, config.globals);
    }

    Object.keys(globals).forEach(function(moduleName) {
        var varName = globals[moduleName];
        var resolved;

        try {
            resolved = resolveRequire(moduleName, config.rootDir);
        } catch(e) {
            if (e.moduleNotFound) {
                if (config.globals && config.globals.hasOwnProperty(moduleName)) {
                    throw e;
                }
            } else {
                throw e;
            }
        }

        delete globals[moduleName];

        if (resolved) {
            resolved = resolved.main ? resolved.main.filePath : resolved.filePath;
            globals[resolved] = varName;
        }

    });

    config.globals = globals;

    optimizer.on('optimizerCacheCreated', function(cacheInfo) {
        var optimizerCache = cacheInfo.optimizerCache;

        optimizerCache.configureCacheDefaults({
            '*': { // Any profile
                'optimizer-require/inspect': {
                    store: 'disk',
                    encoding: 'utf8',
                    valueType: 'json'
                },
                'optimizer-require/transformed': {
                    store: 'disk',
                    singleFile: false,
                    encoding: 'utf8'
                }
            }
        });
    });

    optimizer.dependencies.registerRequireExtension('js', {
            read: function(path) {
                return fs.createReadStream(path, 'utf8');
            },

            getLastModified: function(path, optimizerContext, callback) {
                optimizerContext.getFileLastModified(path, callback);
            }
        });

    optimizer.dependencies.registerRequireExtension('json', {
            object: true,

            read: function(path) {
                return fs.createReadStream(path, 'utf8');
            },

            getLastModified: function(path, optimizerContext, callback) {
                optimizerContext.getFileLastModified(path, callback);
            }
        });

    optimizer.dependencies.registerJavaScriptType('commonjs-def', dependency_commonjs_def);
    optimizer.dependencies.registerJavaScriptType('commonjs-run', dependency_commonjs_run);
    optimizer.dependencies.registerJavaScriptType('commonjs-dep', depednency_commonjs_dep);
    optimizer.dependencies.registerJavaScriptType('commonjs-main', dependency_commonjs_main);
    optimizer.dependencies.registerJavaScriptType('commonjs-remap', dependency_commonjs_remap);
    optimizer.dependencies.registerJavaScriptType('commonjs-resolved', dependency_commonjs_resolved);
    optimizer.dependencies.registerJavaScriptType('commonjs-ready', dependency_commonjs_ready);
    optimizer.dependencies.registerJavaScriptType('commonjs-search-path', dependency_commonjs_search_path);

    optimizer.dependencies.registerPackageType('require', dependency_require.create(config, optimizer));

    optimizer.dependencies.addNormalizer(function(dependency) {
        if (typeof dependency === 'string') {
            var matches;

            if ((matches = requireRegExp.exec(dependency))) {
                return {
                    type: 'require',
                    path: matches[1]
                };
            } else if ((matches = requireRunRegExp.exec(dependency))) {
                return {
                    type: 'require',
                    path: matches[1],
                    run: true
                };
            }
        }
        else if (!dependency.type) {
            if (dependency.require) {
                var reqDep = {
                    type: 'require',
                    path: dependency.require
                };

                extend(reqDep, dependency);
                delete reqDep.require;

                return reqDep;
            } else if (dependency['require-run']) {
                var reqRunDep = {
                    type: 'require',
                    run: true,
                    path: dependency['require-run']
                };

                extend(reqRunDep, dependency);
                delete reqRunDep['require-run'];

                return reqRunDep;
            }
        }
    });
};
