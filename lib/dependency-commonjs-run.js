var transport = require('raptor-modules/transport');
var requireReader = require('./require-reader');
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
            requireReader.stream(this._file, context, this._reader));
    },

    lastModified: function() {
        return this.resourceLastModified(this._file);
    },

    getSourceFile: function() {
        return this._file;
    }
};