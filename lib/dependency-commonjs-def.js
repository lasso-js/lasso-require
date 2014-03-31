var transport = require('raptor-modules/transport');
var nodePath = require('path');
var requireReader = require('./require-reader');

module.exports = {
    properties: {
        'path': 'string',
        'run': 'boolean',
        'globals': 'string'
    },
    
    getDir: function() {
        return nodePath.dirname(this._file);
    },

    read: function(context) {
        return transport.defineCode(
            this.path, 
            requireReader.stream(this._file, context, this._reader),
            {
                additionalVars: this._additionalVars,
                run: this.run === true,
                globals: this.globals
            });
    },

    lastModified: function() {
        return this.resourceLastModified(this._file);
    },

    getSourceFile: function() {
        return this._file;
    }
};