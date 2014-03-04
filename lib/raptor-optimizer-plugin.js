require('raptor-ecma/es6');
var extend = require('raptor-util').extend;

module.exports = function plugin(optimizer, config) {
    optimizer.dependencies.registerPackageType('require', require('./dependency-require'));
    optimizer.dependencies.registerJavaScriptType('commonjs-def', require('./dependency-commonjs-def'));
    optimizer.dependencies.registerJavaScriptType('commonjs-run', require('./dependency-commonjs-run'));
    optimizer.dependencies.registerJavaScriptType('commonjs-dep', require('./dependency-commonjs-dep'));
    optimizer.dependencies.registerJavaScriptType('commonjs-main', require('./dependency-commonjs-main'));
    optimizer.dependencies.registerJavaScriptType('commonjs-remap', require('./dependency-commonjs-remap'));
    optimizer.dependencies.registerJavaScriptType('commonjs-resolved', require('./dependency-commonjs-resolved'));
    optimizer.dependencies.addNormalizer(function(dependency) {
        if (typeof dependency === 'string') {
            if (dependency.startsWith('require ')) {
                return {
                    type: 'require',
                    path: dependency.substring('require '.length)
                };
            }
        }
        else if (!dependency.type) {
            if (dependency.require) {
                var reqDep = {
                    type: 'require',
                    path: dependency.require
                };

                delete dependency.require;
                extend(reqDep, dependency);
                return reqDep;
            }
        }
    });
};

module.exports.INCLUDE_CLIENT = true;