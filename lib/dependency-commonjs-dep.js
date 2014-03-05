var transport = require('raptor-modules/transport');
var nodePath = require('path');
module.exports = {
    properties: {
        'parentPath': 'string',
        'childName': 'string',
        'childVersion': 'string',
        'remap': 'string'
    },
    
    getDir: function() {
        return nodePath.dirname(this._sourceFile);
    },

    read: function(context) {
        return transport.registerDependencyCode(
            this.parentPath,
            this.childName,
            this.childVersion,
            this.remap);
    },

    lastModified: function() {
        return 0;
    },

    getSourceFile: function() {
        return this._sourceFile;
    },

    doCalculateKey: function() {
        return this.calculateKeyFromProps();
    }
};