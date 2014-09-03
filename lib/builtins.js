var resolveRequire = require('raptor-modules/resolver').resolveRequire;

module.exports = {
    path: resolveRequire('path', __dirname, {root: __dirname}),
    events: resolveRequire('events', __dirname, {root: __dirname}),
    'raptor-loader': resolveRequire('raptor-loader', __dirname, {root: __dirname})
};