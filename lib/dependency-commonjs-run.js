var transport = require('../../transport');
var invokeReader = require('./invoke-reader');

module.exports = {
    properties: {
        'path': 'string'
    },
    
    getDir: function() {
        return this.getParentManifestDir();
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