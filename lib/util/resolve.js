var resolver = require('raptor-modules/resolver');
var createError = require('raptor-util/createError');
var builtins = require('../builtins');
var series = require('raptor-async/series');
var parseRequire = require('./parseRequire');
var extend = require('raptor-util/extend');
var ok = require('assert').ok;
var equal = require('assert').equal;

exports.resolveRequire = function resolveRequire(path, from, fromFile, options, callback) {
    var parsedRequire = parseRequire(path);
    path = parsedRequire.path;
    var dependencyType = parsedRequire.type;

    try {
        var resolved = resolver.resolveRequire(path, from, options);
        resolved = extend({}, resolved);
        resolved.dependencyType = dependencyType;

        if (resolved.isDir && !resolved.main) {
            return callback(
                new Error(
                    'require(' + JSON.stringify(path) +
                    ') resolved to a directory at path "' + resolved.filePath +
                    '" which does not have a main file (referenced in "' + fromFile + '")'));
        }


        return callback(null, resolved);
    } catch(e) {
        if (e.moduleNotFound || e.code === 'ENOENT') {
            // Check if it is a builtin module ("path", etc.)
            if (path && !dependencyType && builtins[path]) {
                return callback(null, builtins[path]);
            } else {
                return callback(createError(new Error('Unable to resolve required module "' + path + '" (from "' + from + '") referenced in "' + fromFile + '". Exception: ' + e), e));
            }
        } else {
            // Uncaught exception
            throw e;
        }
    }
};

exports.resolveInspectedRequires = function resolveInspectedRequires(inspected, fromDir, fromFile, isBuiltin, options, callback) {
    ok(inspected, '"inspected" is required');
    equal(typeof fromDir, 'string', '"fromDir" should be a string');
    equal(typeof callback, 'function', '"callback" should be a string');

    var allRequires = [];

    var asyncTasks = [];

    function handleRequire(require) {
        asyncTasks.push(function(callback) {
            exports.resolveRequire(require.path, fromDir, fromFile, options, function(err, resolved) {
                if (err) {
                    return callback(err);
                }

                if (isBuiltin && resolved.builtin !== true) {
                    resolved = extend({}, resolved);
                    resolved.builtin = true;
                }

                require.resolved = resolved;
                allRequires.push(require);
                callback();
            });
        });
    }

    inspected.requires.forEach(handleRequire);
    inspected.asyncBlocks.forEach(function(asyncBlock) {
        asyncBlock.requires.forEach(handleRequire);
    });

    series(asyncTasks, function(err) {
        if (err) {
            return callback(err);
        }

        inspected.allRequires = allRequires;
        callback(null, inspected);
    });
};