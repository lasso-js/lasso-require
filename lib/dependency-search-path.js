var transport = require('raptor-modules/transport');

exports.create = function(config, lasso) {
    return {
        properties: {
            'path': 'string',
            'paths': 'string[]'
        },

        init: function() {
            if (!this.paths) {
                this.paths = [];
            }

            if (this.path) {
                this.paths.push(this.path);
            }
        },

        getDir: function() {
            return null;
        },

        read: function(context) {
            return transport.addSearchPathsCode(this.paths, {
                modulesRuntimeGlobal: config.modulesRuntimeGlobal
            });
        },

        getUnbundledTargetPrefix: function(lassoContext) {
            return config.unbundledTargetPrefix;
        },

        getUnbundledTarget: function() {
            return 'raptor-modules-meta';
        },

        calculateKey: function() {
            return 'search-path: ' + this.paths;
        }
    };
};
