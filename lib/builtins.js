var resolveRequire = require('raptor-modules/resolver').resolveRequire;
var extend = require('raptor-util/extend');

function resolveBuiltinRequire(name) {
    var resolved = resolveRequire(name, __dirname, { makeRoot: true });
    extend({}, resolved);
    resolved.builtin = true;
    return resolved;
}

module.exports = {
    'path':          resolveBuiltinRequire('path'),
    'events':        resolveBuiltinRequire('events'),
    'process':       resolveBuiltinRequire('process'),
    'raptor-loader': resolveBuiltinRequire('raptor-loader')
};
