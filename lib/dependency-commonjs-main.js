var transport = require('raptor-modules/transport');
var nodePath = require('path');

module.exports = {
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
            this.main);
    },

    lastModified: function() {
        return -1;
    },

    getSourceFile: function() {
        return this._sourceFile;
    },

    doCalculateKey: function() {
        return this.calculateKeyFromProps();
    },

    getUnbundledTarget: function() {
        return 'raptor-modules-meta';
    }
};