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
            // the path to the resource
            this.path,

            // Arguments:
            // 1) The file path to read
            // 2) The context
            // 3) The reader function that may have been created already (optional)
            requireReader.stream(this._file, context, this._reader),

            // options for defineCode
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