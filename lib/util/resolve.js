var resolver = require('raptor-modules/resolver');
var createError = require('raptor-util/createError');

var series = require('raptor-async/series');
var parseRequire = require('./parseRequire');
var extend = require('raptor-util/extend');
var ok = require('assert').ok;
var equal = require('assert').equal;
var nodePath = require('path');

var _normalizePath = nodePath.sep === '/' ?
    function _normalizePathUnix(path) {
        // nothing to do for non-Windows platform
        return path;
    } :
    function _normalizePathWindows(path) {
        // replace back-slash with forward-slash
        return path.replace(/[\\]/g, '/');
    };

exports.createResolver = function(builtins) {

    function resolveRequire(path, fromDir, fromFile, options, lassoContext, callback) {
        equal(typeof callback, 'function', '"callback" function expected');

        var parsedRequire = parseRequire(path);

        // Normalize the path by making sure the path separator is always forward slash
        // (normalize does nothing on non-Windows platform)
        path = _normalizePath(parsedRequire.path);

        var dependencyType = parsedRequire.type;
        var lassoJsonPath = nodePath.join(fromDir, 'browser.json');
        var remap;

        if (lassoContext.cachingFs.existsSync(lassoJsonPath)) {
            var lassoPackage = lassoContext.readPackageFile(lassoJsonPath);
            remap = lassoPackage.getRequireRemap(lassoContext);
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

        var resolved;
        try {
            resolved = resolver.resolveRequire(path, fromDir, options);
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
    }

    function resolveInspectedRequires(inspected, fromDir, fromFile, isBuiltin, options, lassoContext, callback) {
        ok(inspected, '"inspected" is required');
        equal(typeof fromDir, 'string', '"fromDir" should be a string');
        equal(typeof callback, 'function', '"callback" should be a string');

        var allRequires = [];

        var asyncTasks = [];

        function handleRequire(require) {
            asyncTasks.push(function(callback) {
                resolveRequire(require.path, fromDir, fromFile, options, lassoContext, function(err, resolved) {
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

        if (inspected.requires) {
            inspected.requires.forEach(handleRequire);
        }

        if (inspected.asyncBlocks) {
            inspected.asyncBlocks.forEach(function(asyncBlock) {
                asyncBlock.requires.forEach(handleRequire);
            });
        }

        series(asyncTasks, function(err) {
            if (err) {
                return callback(err);
            }

            inspected.allRequires = allRequires;
            callback(null, inspected);
        });
    }

    return {
        resolveRequire: resolveRequire,
        resolveInspectedRequires: resolveInspectedRequires
    };
};
