var nodePath = require('path');
var transport = require('lasso-modules-client/transport');

exports.create = function(config, lasso) {
    return {
        properties: {
            path: 'string',
            wait: 'boolean',
            file: 'string' // The original source file that this dependency is assocaited with
        },

        init(lassoContext) {

        },

        getDir: function() {
            return nodePath.dirname(this._file);
        },

        read: function(lassoContext) {
            // the default is to wait so only output options
            // if the wait value is not equal to the default value
            var runOptions = (this.wait === false) ? {wait: false} : undefined;

            return transport.codeGenerators.run(
                // the path to the resource
                this.path,

                // options for runCode
                runOptions,

                // options that affect how the code is generated
                {
                    modulesRuntimeGlobal: config.modulesRuntimeGlobal
                });
        },

        getLastModified: function(lassoContext, callback) {
            callback(null, -1);
        },

        getUnbundledTargetPrefix: function(lassoContext) {
            return config.unbundledTargetPrefix;
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
            return this.file;
        },

        calculateKey: function() {
            return 'modules-run:' + this.path + '|' + this.wait;
        }
    };
};
