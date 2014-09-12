var transport = require('raptor-modules/transport');
var nodePath = require('path');
var requireReader = require('./require-reader');

module.exports = {
    properties: {
        'path': 'string',
        'globals': 'string',
        'wait': 'boolean'
    },

    getDir: function() {
        return nodePath.dirname(this._file);
    },

    read: function(optimizerContext) {
        var lastDot = this._file.lastIndexOf('.');
        var ext;
        var isObject = false;
        if (lastDot !== -1) {
            ext = this._file.substring(lastDot+1);
            var requireExtInfo = optimizerContext.dependencyRegistry.getRegisteredRequireExtension(ext);
            if (requireExtInfo) {
                isObject = requireExtInfo.object === true;
            }
        }

        return transport.defineCode(
            // the path to the resource
            this.path,

            // Arguments:
            // 1) The file path to read
            // 2) The optimizerContext
            // 3) The reader function that may have been created already (optional)
            requireReader.stream(this._file, optimizerContext, this._reader),

            // options for defineCode
            {
                additionalVars: this._additionalVars,
                globals: this.globals,
                object: isObject
            });
    },

    lastModified: function(optimizerContext, callback) {
        this.resourceLastModified(this._file, callback);
    },

    getSourceFile: function() {
        return this._file;
    },

    calculateKey: function() {
        return this._file;
    }
};
