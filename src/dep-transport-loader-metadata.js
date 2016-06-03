var transport = require('lasso-modules-client/transport');

exports.create = function(config, lasso) {
    return {
        properties: {
            'key': 'string',
            'packageName': 'string',
            'bundle': 'string'
        },

        init(lassoContext) {

        },

        getKey: function() {
            return this._key;
        },

        toString: function() {
            return '[' + this._key + ']';
        },

        read: function(context) {
            return transport.codeGenerators.loaderMetadata(
                this.packageName,
                this.bundle,
                context,
                {
                    modulesRuntimeGlobal: config.modulesRuntimeGlobal
                });
        },

        getUnbundledTargetPrefix: function(lassoContext) {
            return config.unbundledTargetPrefix;
        },

        getUnbundledTarget: function() {
            return 'lasso-modules-meta';
        },

        calculateKey: function() {
            return this._key;
        },

        getLastModified: function(lassoContext, callback) {
            callback(null, -1);
        }
    };
};
