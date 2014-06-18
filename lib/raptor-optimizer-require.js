var dependency_require = require('./dependency-require');
var dependency_commonjs_def = require('./dependency-commonjs-def');
var depednency_commonjs_dep = require('./dependency-commonjs-dep');
var dependency_commonjs_main = require('./dependency-commonjs-main');
var dependency_commonjs_remap = require('./dependency-commonjs-remap');
var dependency_commonjs_resolved = require('./dependency-commonjs-resolved');
var dependency_commonjs_ready = require('./dependency-commonjs-ready');
var dependency_commonjs_search_path = require('./dependency-commonjs-search-path');

var extend = require('raptor-util').extend;
var requireRegExp = /^require\s+(.*)$/;
var requireRunRegExp = /^require-run\s*:\s*(.*)$/;
var resolveRequire = require('raptor-modules/resolver').resolveRequire;

var defaultGlobals = {
    'jquery': ['$', 'jQuery']
};

module.exports = exports = function plugin(optimizer, config) {
    config.rootDir = config.rootDir || optimizer.config.getProjectRoot();
    
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

    optimizer.dependencies.registerPackageType('require', dependency_require.create(config));
    optimizer.dependencies.registerJavaScriptType('commonjs-def', dependency_commonjs_def);
    optimizer.dependencies.registerJavaScriptType('commonjs-dep', depednency_commonjs_dep);
    optimizer.dependencies.registerJavaScriptType('commonjs-main', dependency_commonjs_main);
    optimizer.dependencies.registerJavaScriptType('commonjs-remap', dependency_commonjs_remap);
    optimizer.dependencies.registerJavaScriptType('commonjs-resolved', dependency_commonjs_resolved);
    optimizer.dependencies.registerJavaScriptType('commonjs-ready', dependency_commonjs_ready);
    optimizer.dependencies.registerJavaScriptType('commonjs-search-path', dependency_commonjs_search_path);

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
            }
        }
    });
};

exports.INCLUDE_CLIENT = true;