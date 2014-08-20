var fs = require('fs');

module.exports = function jsonReader(path, optimizerContext, callback) {
    return fs.createReadStream(path, {encoding: 'utf8'});
};