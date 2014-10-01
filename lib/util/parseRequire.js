module.exports = function parseRequire(path) {
    var typeSeparatorIndex = path.indexOf(':');
    if (typeSeparatorIndex !== -1) {
        var type = path.substring(0, typeSeparatorIndex).trim();
        path = path.substring(typeSeparatorIndex+1).trim();

        return {
            type: type,
            path: path
        };
    } else {
        return {
            path: path
        };
    }
};