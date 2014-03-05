var transport = require('raptor-modules/transport');
var nodePath = require('path');

module.exports = {
    properties: {
        'from': 'string',
        'to': 'string'
    },
    
    getDir: function() {
        return nodePath.dirname(this._sourceFile);
    },

    read: function(context) {
        return transport.registerRemapCode(
            this.from,
            this.to);
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