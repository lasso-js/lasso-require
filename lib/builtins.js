var resolveRequire = require('raptor-modules/resolver').resolveRequire;
var extend = require('raptor-util/extend');

function resolveBuiltinRequire(name) {
    var resolved = resolveRequire(name, __dirname, { makeRoot: true });
    extend({}, resolved);
    resolved.builtin = true;
    return resolved;
}

module.exports = {
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
