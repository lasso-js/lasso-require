var raptorPromises = require('raptor-promises');
var fs = require('fs');
var eventStream = require('event-stream');

function DEFAULT_READER_CALLBACK(path, context, callback) {
    fs.readFile(path, {encoding: 'utf8'}, callback);
}

function DEFAULT_READER_STREAM(path, context) {
    return fs.createReadStream(path, {encoding: 'utf8'});
}

function defer(path, context, reader) {

    if (!reader) {
        reader = DEFAULT_READER_CALLBACK;
    }

    var deferred;
    function callback(err, data) {
        deferred = deferred || raptorPromises.defer();
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(data);
        }
    }

    var result = reader(path, context, callback);
    if (result == null) {
        // Callback will be used so return a promise that
        // gets resolved/rejected when the callback is invoked
        deferred = deferred || raptorPromises.defer();
        return deferred.promise;
    } else {
        if (typeof result.then === 'function') {
            // Already a promise so just return it
            return result;
        } else if (typeof result.pipe === 'function') {
            // Result is a stream... our code inspector
            // does not operate on streams so convert it
            // into a promise that will get resolved with
            // the full source
            deferred = raptorPromises.defer();

            var src = '';

            result.on('data', function(data) {
                src += data;
            });

            result.on('end', function() {
                deferred.resolve(src);
            });

            result.on('error', function(err) {
                deferred.reject(err);
            });

            result.resume();

            return deferred.promise;
        }
    }
}

function stream(path, context, reader) {
    if (!reader) {
        reader = DEFAULT_READER_STREAM;
    }

    var readStream;

    function callback(err, data) {
        readStream = readStream || eventStream.through();
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

    var result = reader(path, context, callback);
    if (result == null) {
        // Callback will be used so return the stream
        // that will receive the data from the callback
        readStream = readStream || eventStream.through();
        return readStream;
    } else {
        if (typeof result.then === 'function') {
            readStream = readStream || eventStream.through();
            result.then(
                function(data) {
                    callback(null, data);
                },
                callback);
            return readStream;
        } else if (typeof result.pipe === 'function') {
            return result;
        }
    }
}

exports.defer = defer;
exports.stream = stream;