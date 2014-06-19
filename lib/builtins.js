var resolveRequire = require('raptor-modules/resolver').resolveRequire;

module.exports = {
    path: resolveRequire('path', __dirname, {root: __dirname})
};