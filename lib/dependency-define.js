require('raptor-polyfill/string/startsWith');

var ok = require('assert').ok;
var nodePath = require('path');
var streamToString = require('./util/streamToString');
var defineCode = require('raptor-modules/transport').defineCode.sync;
var StringTransformer = require('./util/StringTransformer');

function transformRequires(code, inspected, asyncBlocks, lassoContext, callback) {
    // We have two goals with this function:
    // 1) Comment out all non-JavaScript module requires
    //    require('./test.css'); --> /*require('./test.css');*/
    // 2) Update the first argument for all require('raptor-loader').async(...) calls
    //
    // In addition, we want to *maintain line numbers* for the transformed code to be nice!

    var stringTransformer = new StringTransformer();

    function transformRequire(require) {
        ok(require.resolved, '"require.resolved" expected');

        var resolved = require.resolved;


        if (!resolved.isDir && (resolved.dependencyType || !lassoContext.dependencyRegistry.getRequireHandler(resolved.filePath, lassoContext))) {
            if (require.range) {
                stringTransformer.comment(require.range);
            }
        } else {
            if (require.argRange && (require.path.charAt(0) !== '.' || require.path.startsWith('..'))) {
                stringTransformer.comment(require.argRange);
                stringTransformer.insert(require.argRange[0], '\'' + resolved.logicalPath + '\'');
            }

        }
    }

    function transformAsyncCall(asyncBlock) {
        var name = asyncBlock.name;
        ok(name, '"asyncBlock.name" expected');

        var firstArgRange = asyncBlock.firstArgRange;

        if (asyncBlock.hasInlineDependencies) {
            stringTransformer.comment(firstArgRange);
            stringTransformer.insert(firstArgRange[0], JSON.stringify(name));
        } else {
            stringTransformer.insert(firstArgRange[0], JSON.stringify(name) + ', ');
        }
    }

    if (asyncBlocks && asyncBlocks.length) {
        asyncBlocks.forEach(transformAsyncCall);
    }

    inspected.allRequires.forEach(transformRequire);

    callback(null, stringTransformer.transform(code));
}

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

    read: function(lassoContext, callback) {
        var requireReader = this._requireReader;
        var requireInspected = this._requireInspected;
        var requireAsyncBlocks = this._requireAsyncBlocks;

        var isObject = this.object;
        var globals = this.globals;
        var path = this.path;
        var additionalVars = this._additionalVars;

        var stream = requireReader();
        streamToString(stream, function(err, code) {
            if (err) {
                return callback(err);
            }

            if (isObject) {
                return callback(null, defineCode(path, code, { object: true }));
            } else {
                transformRequires(code, requireInspected, requireAsyncBlocks, lassoContext, function(err, code) {
                    if (err) {
                        return callback(err);
                    }

                    var defCode = defineCode(
                        path,
                        code,
                        {
                            additionalVars: additionalVars,
                            globals: globals,
                        });

                    return callback(null, defCode);
                });
            }
        });
    },

    getLastModified: function(lassoContext, callback) {
        callback(null, this._requireLastModified);
    },

    getSourceFile: function() {
        return this._file;
    },

    calculateKey: function() {
        return this.path;
    }
};
