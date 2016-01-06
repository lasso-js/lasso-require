var nodePath = require('path');
var fs = require('fs');

var _sourceFile =  require.resolve('raptor-modules/client/lib/raptor-modules-client');

var rmod_regex = /\$rmod/g;

exports.create = function(config, lasso) {
    var modulesRuntimeGlobal = config.modulesRuntimeGlobal;

    return {
        getDir: function() {
            return nodePath.dirname(_sourceFile);
        },

        read: function(lassoContext, callback) {
            fs.readFile(_sourceFile, {encoding: 'utf8'}, function(err, contents) {
                if (err) {
                    return callback(err);
                }

                if (modulesRuntimeGlobal) {
                    contents = contents.replace(rmod_regex, modulesRuntimeGlobal);
                }

                callback(null, contents);
            });
        },

        getUnbundledTargetPrefix: function(lassoContext) {
            return config.unbundledTargetPrefix;
        },

        getSourceFile: function() {
            return _sourceFile;
        },

        calculateKey: function() {
            return _sourceFile;
        },

        getReadCacheKey: function() {
            return modulesRuntimeGlobal + '|' + _sourceFile;
        }
    };
};
