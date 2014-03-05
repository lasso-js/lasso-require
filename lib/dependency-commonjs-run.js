var transport = require('raptor-modules/transport');
var invokeReader = require('./invoke-reader');
var nodePath = require('path');

module.exports = {
    properties: {
        'path': 'string'
    },
    
    getDir: function() {
        return nodePath.dirname(this._file);
    },

    read: function(context) {
        return transport.runCode(
            this.path, 
            invokeReader.stream(this._file, context, this._reader));
    },

    lastModified: function() {
        return this.resourceLastModified(this._file);
    },

    getSourceFile: function() {
        return this._file;
    }
};