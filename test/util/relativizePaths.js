function relativizePaths(o, dir) {

    function helper(o) {
        if (Array.isArray(o)) {
            return o.map(helper);
        } else if (typeof o === 'object') {
            for (var k in o) {
                if (o.hasOwnProperty(k)) {
                    var v = o[k];
                    o[k] = helper(v);
                }
            }
        } else if (typeof o === 'string') {
            if (o.startsWith(dir)) {
                return o.substring(dir.length);
            }
        }

        return o;
    }


    return helper(o);
}

module.exports = relativizePaths;