require('raptor-ecma/es6');
var extend = require('raptor-util').extend;
var requireRegExp = /^require\s+(.*)$/;
var requireRunRegExp = /^require-run\s*:\s*(.*)$/;

module.exports = exports = function plugin(optimizer, config) {
    config.rootDir = config.rootDir || optimizer.config.getProjectRoot();

    optimizer.dependencies.registerPackageType('require', require('./dependency-require').create(config));
    optimizer.dependencies.registerJavaScriptType('commonjs-def', require('./dependency-commonjs-def'));
    optimizer.dependencies.registerJavaScriptType('commonjs-run', require('./dependency-commonjs-run'));
    optimizer.dependencies.registerJavaScriptType('commonjs-dep', require('./dependency-commonjs-dep'));
    optimizer.dependencies.registerJavaScriptType('commonjs-main', require('./dependency-commonjs-main'));
    optimizer.dependencies.registerJavaScriptType('commonjs-remap', require('./dependency-commonjs-remap'));
    optimizer.dependencies.registerJavaScriptType('commonjs-resolved', require('./dependency-commonjs-resolved'));
    optimizer.dependencies.registerJavaScriptType('commonjs-ready', require('./dependency-commonjs-ready'));
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