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
var resolve = require('./util/resolve');
var extend = require('raptor-util').extend;
var resolveRequire = require('raptor-modules/resolver').resolveRequire;

var requireRegExp = /^require\s+(.*)$/;
var requireRunRegExp = /^require-run\s*:\s*(.*)$/;
var builtins = require('./builtins');

var defaultGlobals = {
    'jquery': ['$', 'jQuery']
};

module.exports = exports = function plugin(lasso, config) {
    config = extend({}, config || {});

    config.rootDir = config.rootDir || lasso.config.getProjectRoot();
    config.runImmediately = config.runImmediately === true;
    config.builtins = builtins.getBuiltins(config.builtins);
    config.resolver = resolve.createResolver(config.builtins);

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

    lasso.on('lassoCacheCreated', function(cacheInfo) {
        var lassoCache = cacheInfo.lassoCache;

        lassoCache.configureCacheDefaults({
            '*': { // Any profile
                'lasso-require/inspect': {
                    store: 'disk',
                    encoding: 'utf8',
                    valueType: 'json'
                },
                'lasso-require/transformed': {
                    store: 'disk',
                    singleFile: false,
                    encoding: 'utf8'
                }
            }
        });
    });

    lasso.dependencies.registerRequireExtension('js', {
            read: function(path) {
                return fs.createReadStream(path, {encoding: 'utf8'});
            },

            getLastModified: function(path, lassoContext, callback) {
                lassoContext.getFileLastModified(path, callback);
            }
        });

    lasso.dependencies.registerRequireExtension('json', {
            object: true,

            read: function(path) {
                return fs.createReadStream(path, {encoding: 'utf8'});
            },

            getLastModified: function(path, lassoContext, callback) {
                lassoContext.getFileLastModified(path, callback);
            }
        });

    lasso.dependencies.registerJavaScriptType('commonjs-def', dependency_commonjs_def);
    lasso.dependencies.registerJavaScriptType('commonjs-run', dependency_commonjs_run);
    lasso.dependencies.registerJavaScriptType('commonjs-dep', depednency_commonjs_dep);
    lasso.dependencies.registerJavaScriptType('commonjs-main', dependency_commonjs_main);
    lasso.dependencies.registerJavaScriptType('commonjs-remap', dependency_commonjs_remap);
    lasso.dependencies.registerJavaScriptType('commonjs-resolved', dependency_commonjs_resolved);
    lasso.dependencies.registerJavaScriptType('commonjs-ready', dependency_commonjs_ready);
    lasso.dependencies.registerJavaScriptType('commonjs-search-path', dependency_commonjs_search_path);

    lasso.dependencies.registerPackageType('require', dependency_require.create(config, lasso));

    lasso.dependencies.addNormalizer(function(dependency) {
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
