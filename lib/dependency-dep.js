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

    getLastModified: function(lassoContext, callback) {
        callback(null, -1);
    },

    getUnbundledTarget: function() {
        return 'raptor-modules-meta';
    },

    getSourceFile: function() {
        return this._sourceFile;
    },

    calculateKey: function() {
        return this.calculateKeyFromProps();
    }
};
