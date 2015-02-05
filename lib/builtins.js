var resolveRequire = require('raptor-modules/resolver').resolveRequire;
var extend = require('raptor-util/extend');

function resolveBuiltinRequire(name) {
    var resolved = resolveRequire(name, __dirname, { makeRoot: true });
    extend({}, resolved);
    resolved.builtin = true;
    return resolved;
}

var defaultBuiltins = {
    'assert':        resolveBuiltinRequire('assert'),
    'buffer':        resolveBuiltinRequire('buffer'),
    'events':        resolveBuiltinRequire('events'),
    'path':          resolveBuiltinRequire('path'),
    'process':       resolveBuiltinRequire('process'),
    'stream':        resolveBuiltinRequire('stream'),
    'util':          resolveBuiltinRequire('util'),
    'raptor-loader': resolveBuiltinRequire('raptor-loader'),
    'string_decoder': resolveBuiltinRequire('string_decoder')
};


exports.getBuiltins = function(additionalBuiltins) {
    if (!additionalBuiltins) {
        return defaultBuiltins;
    }

    var allBuiltins = extend({}, defaultBuiltins);

    Object.keys(additionalBuiltins).forEach(function(name) {
        var path = additionalBuiltins[name];
        var resolved = resolveBuiltinRequire(path);
        allBuiltins[name] = resolved;
    });

    return allBuiltins;
};