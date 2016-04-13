var lassoResolveFrom = require('lasso-resolve-from');
var extend = require('raptor-util/extend');

function resolveBuiltin(target) {
    var resolved = lassoResolveFrom(__dirname, target);
    if (!resolved) {
        throw new Error('Missing builtin: ' + target);
    }
    return resolved.path;
}

var defaultBuiltins = {
    'assert':         resolveBuiltin('assert'),
    'buffer':         resolveBuiltin('buffer'),
    'events':         resolveBuiltin('events'),
    'path':           resolveBuiltin('path-browserify'),
    'process':        resolveBuiltin('process'),
    'stream':         resolveBuiltin('stream-browserify'),
    'util':           resolveBuiltin('util'),
    'lasso-loader':  resolveBuiltin('lasso-loader'),
    'raptor-loader':  resolveBuiltin('lasso-loader'),
    'string_decoder': resolveBuiltin('string_decoder')
};

exports.getBuiltins = function(additionalBuiltins) {
    var allBuiltins = extend({}, defaultBuiltins);

    function addBuiltins(builtins) {
        Object.keys(builtins).forEach(function(packageName) {
            var builtinTarget = builtins[packageName];

            if (typeof builtinTarget !== 'string') {
                throw new Error('Invalid builtin: ' + packageName + ' (target: ' + builtinTarget + ')');
            }

            allBuiltins[packageName] = builtinTarget;
        });
    }

    if (additionalBuiltins) {
        addBuiltins(additionalBuiltins);
    }

    return allBuiltins;
};