var fs = require('fs');
var babel;
var dependency_require = require('./dependency-require');
var dependency_require_remap = require('./dependency-require-remap');
var dependency_commonjs_def = require('./dependency-define');
var dependency_commonjs_run = require('./dependency-run');
var depednency_commonjs_dep = require('./dependency-dep');
var dependency_commonjs_main = require('./dependency-main');
var dependency_commonjs_remap = require('./dependency-remap');
var dependency_commonjs_resolved = require('./dependency-resolved');
var dependency_commonjs_ready = require('./dependency-ready');
var dependency_commonjs_search_path = require('./dependency-search-path');
var dependency_commonjs_runtime = require('./dependency-commonjs-runtime');
var Transforms = require('./util/Transforms');
var resolve = require('./util/resolve');
var extend = require('raptor-util').extend;
var ignore = require('ignore');
var pathModule = require('path');
var resolveRequire = require('raptor-modules/resolver').resolveRequire;

var requireRegExp = /^require\s+(.*)$/;
var requireRunRegExp = /^require-run\s*:\s*(.*)$/;
var builtins = require('./builtins');

var defaultGlobals = {
    'jquery': ['$', 'jQuery']
};

/**
 * Lazily load babel... it takes a long time!
 */
function getBabel() {
    if (!babel) {
        babel = require('babel-core');
    }
    return babel;
}

module.exports = exports = function plugin(lasso, config) {
    config = config ? extend({}, config) : {};

    config.rootDir = config.rootDir || lasso.config.getProjectRoot();
    config.runImmediately = config.runImmediately === true;
    config.builtins = builtins.getBuiltins(config.builtins);
    config.resolver = resolve.createResolver(config.builtins);


    var babelConfig = {
    };

    if (config.babel) {
        extend(babelConfig, config.babel);
    }

    var babelExtensions = babelConfig.extensions || ['es6'];
    delete babelConfig.extensions;

    var babelPaths = babelConfig.paths;
    var babelIgnoreFilter = babelPaths && ignore().add(babelPaths
        .map(function(path) { // add the root dir first
            return pathModule.join(config.rootDir, path);
        })
        .map(function(path) { // remove the root dir and make it relative
            return pathModule.relative(config.rootDir, path);
        })
    );
    delete babelConfig.paths;

    var babelConfigFinalized = false;

    /**
     * Lazily load the babel presets... it takes a long time!
     */
    function getBabelConfig() {
        if (!babelConfigFinalized) {
            babelConfigFinalized = true;
            if (!babelConfig.presets) {
                babelConfig.presets = [require('babel-preset-es2015')];
            }
        }
        return babelConfig;
    }

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

    // Extension for babel
    function babelTransformFile(path, callback) {
        'use strict';
        getBabel().transformFile(path, getBabelConfig(), function(err, result) {
            if (err) {
                return callback(err);
            }
            callback(null, result.code);
        });
    }

    function babelTransformCode(src, callback) {
        var result = getBabel().transform(src, getBabelConfig());
        try {
            return callback(null, result.code);
        } catch(e) {
            return callback(e);
        }
    }

    function isPathWhitelisted(path) {
        if (!babelIgnoreFilter) {
            // Return true if no path filter is present
            return true;
        }

        var ignored = babelIgnoreFilter.filter(pathModule.relative(config.rootDir, path));
        return !ignored.length; // Inverse the value as it is a ignore pattern
    }

    var babelJavaScriptType = lasso.dependencies.createResourceTransformType(function(src, callback) {
        babelTransformCode(src, callback);
    });

    babelExtensions.forEach(function(babelExtension) {
        lasso.dependencies.registerJavaScriptType(babelExtension, babelJavaScriptType);

        lasso.dependencies.registerRequireExtension(babelExtension, {
            read: function(path, lassoContext, callback) {
                if (isPathWhitelisted(path)) {
                    return babelTransformFile(path, callback);
                }
                return fs.createReadStream(path, { encoding: 'utf8' });
            },

            getLastModified: function(path, lassoContext, callback) {
                lassoContext.getFileLastModified(path, callback);
            }
        });
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

    if (config.modulesRuntimeGlobal) {
        if (!config.unbundledTargetPrefix) {
            // Use the modules global variable name as the unbundled
            // target prefix (it will get sanitized later)
            config.unbundledTargetPrefix = config.modulesRuntimeGlobal;
        }

        // Sanitize the global variable name
        config.modulesRuntimeGlobal =
            config.modulesRuntimeGlobal.replace(/[^a-zA-Z0-9\_\$]+/g, '_');
    } else {
        // Use empty string simply because this used as part of the read
        // cache key for "commonjs-def" dependencies.
        config.modulesRuntimeGlobal = '';
    }

    var prefix;
    if ((prefix = config.unbundledTargetPrefix)) {
        // Build a friendly looking prefix which is used to create
        // nested directories when module output files are not bundled.
        prefix = prefix.replace(/[^a-zA-Z0-9\_]+/g, '-');

        // remove any leading and trailing "-" characters that may
        // have been created and store the result
        config.unbundledTargetPrefix =
            prefix.replace(/^-+/, '').replace(/-+$/, '');
    }

    lasso.dependencies.registerJavaScriptType('commonjs-def', dependency_commonjs_def.create(config, lasso));
    lasso.dependencies.registerJavaScriptType('commonjs-run', dependency_commonjs_run.create(config, lasso));
    lasso.dependencies.registerJavaScriptType('commonjs-dep', depednency_commonjs_dep.create(config, lasso));
    lasso.dependencies.registerJavaScriptType('commonjs-main', dependency_commonjs_main.create(config, lasso));
    lasso.dependencies.registerJavaScriptType('commonjs-remap', dependency_commonjs_remap.create(config, lasso));
    lasso.dependencies.registerJavaScriptType('commonjs-resolved', dependency_commonjs_resolved.create(config, lasso));
    lasso.dependencies.registerJavaScriptType('commonjs-ready', dependency_commonjs_ready.create(config, lasso));
    lasso.dependencies.registerJavaScriptType('commonjs-search-path', dependency_commonjs_search_path.create(config, lasso));
    lasso.dependencies.registerJavaScriptType('commonjs-runtime', dependency_commonjs_runtime.create(config, lasso));

    lasso.dependencies.registerPackageType('require', dependency_require.create(config, lasso));
    lasso.dependencies.registerPackageType('require-remap', dependency_require_remap.create(config, lasso));

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
