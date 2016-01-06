var transport = require('raptor-modules/transport');
var nodePath = require('path');

exports.create = function(config, lasso) {
    return {
        properties: {
            'dir': 'string',
            'main': 'string'
        },

        getDir: function() {
            return nodePath.dirname(this._sourceFile);
        },

        read: function(context) {
            return transport.registerMainCode(
                this.dir,
                this.main,
                {
                    modulesRuntimeGlobal: config.modulesRuntimeGlobal
                });
        },

        getLastModified: function(lassoContext, callback) {
            callback(null, -1);
        },

        getSourceFile: function() {
            return this._sourceFile;
        },

        calculateKey: function() {
            return this.calculateKeyFromProps();
        },

        getUnbundledTargetPrefix: function(lassoContext) {
            return config.unbundledTargetPrefix;
        },

        getUnbundledTarget: function() {
            return 'raptor-modules-meta';
        }
    };
};
