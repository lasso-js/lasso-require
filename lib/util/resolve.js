var resolver = require('raptor-modules/resolver');
var createError = require('raptor-util/createError');
var builtins = require('../builtins');
var series = require('raptor-async/series');
var parseRequire = require('./parseRequire');
var extend = require('raptor-util/extend');
var ok = require('assert').ok;
var equal = require('assert').equal;
var nodePath = require('path');

exports.resolveRequire = function resolveRequire(path, fromDir, fromFile, options, optimizerContext, callback) {
    equal(typeof callback, 'function', '"callback" function expected');

    var parsedRequire = parseRequire(path);
    path = parsedRequire.path;
    var dependencyType = parsedRequire.type;
    var optimizerJsonPath = nodePath.join(fromDir, 'optimizer.json');
    var remap;

    if (optimizerContext.cachingFs.existsSync(optimizerJsonPath)) {
        var optimizerPackage = optimizerContext.readPackageFile(optimizerJsonPath);
        remap = optimizerPackage.getRequireRemap(optimizerContext);
    }

    if (remap) {
        if (options.remap) {
            remap = extend({}, remap);
            extend(remap, options.remap);
            options.remap = remap;
        } else {
            options.remap = remap;
        }
    }

    try {
        var resolved = resolver.resolveRequire(path, fromDir, options);
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
                return callback(createError(new Error('Unable to resolve required module "' + path + '" (fromDir "' + fromDir + '") referenced in "' + fromFile + '". Exception: ' + e), e));
            }
        } else {
            // Uncaught exception
            throw e;
        }
    }
};

exports.resolveInspectedRequires = function resolveInspectedRequires(inspected, fromDir, fromFile, isBuiltin, options, optimizerContext, callback) {
    ok(inspected, '"inspected" is required');
    equal(typeof fromDir, 'string', '"fromDir" should be a string');
    equal(typeof callback, 'function', '"callback" should be a string');

    var allRequires = [];

    var asyncTasks = [];

    function handleRequire(require) {
        asyncTasks.push(function(callback) {
            exports.resolveRequire(require.path, fromDir, fromFile, options, optimizerContext, function(err, resolved) {
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