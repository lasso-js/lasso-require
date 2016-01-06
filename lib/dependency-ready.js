var transport = require('raptor-modules/transport');

exports.create = function(config, lasso) {
    return {
        properties: {
        },

        getDir: function() {
            return null;
        },

        read: function(context) {
            return transport.readyCode({
                modulesRuntimeGlobal: config.modulesRuntimeGlobal
            });
        },

        calculateKey: function() {
            return '$commonjs-ready';
        },

        getLastModified: function(lassoContext, callback) {
            callback(null, -1);
        }
    };
};
