var transport = require('raptor-modules/transport');

module.exports = {
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
            this.resolved);
    },

    getLastModified: function(lassoContext, callback) {
        callback(null, -1);
    },

    calculateKey: function() {
        return this.calculateKeyFromProps();
    }
};
