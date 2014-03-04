var transport = require('../../transport');

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

    lastModified: function() {
        return 0;
    },

    doCalculateKey: function() {
        return this.calculateKeyFromProps();
    }
};