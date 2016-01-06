var transport = require('raptor-modules/transport');

exports.create = function(config, lasso) {
    return {
        properties: {
            'target': 'string',
            'from': 'string',
            'resolved': 'string'
        },

        getDir: function() {
            return this.getParentManifestDir();
        },

        read: function(context) {
            return transport.registerResolvedCode(
                this.target,
                this.from,
                this.resolved,
                {
                    modulesRuntimeGlobal: config.modulesRuntimeGlobal
                });
        },

        getLastModified: function(lassoContext, callback) {
            callback(null, -1);
        },

        calculateKey: function() {
            return this.calculateKeyFromProps();
        }
    };
};
