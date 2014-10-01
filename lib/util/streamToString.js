module.exports = function(stream, callback) {
    var str = '';
    stream
        .on('data', function(data) {
            str += data;
        })
        .on('error', function(err) {
            callback(err);
        })
        .on('end', function() {
            callback(null, str);
        });
};