var fs = require('fs');
var through = require('through');

function DEFAULT_READER_STREAM(path, context) {
    return fs.createReadStream(path, {encoding: 'utf8'});
}


function stream(path, context, readFunc) {
    if (!readFunc) {
        var pageOptimizer = context.optimizer;

        if (pageOptimizer) {
            readFunc = pageOptimizer.dependencies.getRequireReader(path);
        }

        if (!readFunc) {
            readFunc = DEFAULT_READER_STREAM;
        }
    }

    var readStream;

    function callback(err, data) {
        readStream = readStream || through();
        if (err) {
            readStream.pause();
            process.nextTick(function() {
                readStream.emit('error', err);
                readStream.resume();
                readStream.end();
            });
            return;
        }

        readStream.queue(data);
        readStream.end();
    }

    var result = readFunc(path, context, callback);
    if (result == null) {
        // Callback will be used so return the stream
        // that will receive the data from the callback
        readStream = readStream || through();
        return readStream;
    } else {
        if (typeof result.then === 'function') {
            readStream = readStream || through();
            result.then(
                function(data) {
                    callback(null, data);
                },
                callback);
            return readStream;
        } else if (typeof result.pipe === 'function') {
            return result;
        } else {
            throw new Error('Invalid return: ' + result);
        }
    }
}

exports.stream = stream;