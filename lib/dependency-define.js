var transport = require('raptor-modules/transport');
var nodePath = require('path');

module.exports = {
    properties: {
        'path': 'string',
        'globals': 'string',
        'wait': 'boolean',
        'object': 'boolean'
    },

    getDir: function() {
        return nodePath.dirname(this._file);
    },

    read: function(optimizerContext) {
        var requireReader = this._requireReader;

        // console.log('requireResader: ', requireReader.toString());
        return transport.defineCode(
            // the path to the resource
            this.path,

            // Arguments:
            // 1) The file path to read
            // 2) The optimizerContext
            // 3) The reader function that may have been created already (optional)
            requireReader(),

            // options for defineCode
            {
                additionalVars: this._additionalVars,
                globals: this.globals,
                object: this.object
            });
    },

    lastModified: function(optimizerContext, callback) {
        callback(null, this._requireLastModified);
    },

    getSourceFile: function() {
        return this._file;
    },

    calculateKey: function() {
        return this._file;
    }
};
