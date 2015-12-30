var nodePath = require('path');
var transport = require('raptor-modules/transport');

module.exports = {

    properties: {
        path: 'string',
        wait: 'boolean'
    },

    getDir: function() {
        return nodePath.dirname(this._file);
    },

    read: function(lassoContext) {
        // the default is to wait so only output options
        // if the wait value is not equal to the default value
        var options = (this.wait === false) ? {wait: false} : undefined;

        return transport.runCode(
            // the path to the resource
            this.path,

            // options for runCode
            options);
    },

    getLastModified: function(lassoContext, callback) {
        this.getFileLastModified(this._file, callback);
    },

    getUnbundledTarget: function() {
        var ext = nodePath.extname(this._file);
        var fileNameNoExt = this._file;
        if (ext) {
            fileNameNoExt = fileNameNoExt.substring(0, fileNameNoExt.length - ext.length);
        }
        return fileNameNoExt + '-run';
    },

    getSourceFile: function() {
        return this._file;
    },

    calculateKey: function() {
        return this._file + '|' + this.wait;
    }
};
