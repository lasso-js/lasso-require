var transport = require('../../transport');
var nodePath = require('path');
var invokeReader = require('./invoke-reader');

module.exports = {
    properties: {
        'path': 'string'
    },
    
    getDir: function() {
        return nodePath.dirname(this._file);
    },

    read: function(context) {
        return transport.defineCode(
            this.path, 
            invokeReader.stream(this._file, context, this._reader),
            {
                additionalVars: this._additionalVars
            });
    },

    lastModified: function() {
        return this.resourceLastModified(this._file);
    },

    getSourceFile: function() {
        return this._file;
    }
};