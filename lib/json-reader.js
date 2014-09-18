var fs = require('fs');

module.exports = function jsonReader(path, optimizerContext) {
    return fs.createReadStream(path, {encoding: 'utf8'});
};
