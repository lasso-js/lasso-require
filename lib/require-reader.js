var fs = require('fs');
var through = require('through');
var logger = require('raptor-logging').logger(module);

function DEFAULT_READER(path, optimizerContext) {
    return fs.createReadStream(path, {encoding: 'utf8'});
}

/**
 * @param {String} path a path to a source file to read
 * @param {OptimizerContext} optimizerContext an optimizer context
 * @param {Function} reader an optional reader function (a function that returns a stream or invokes a callback)
 */
exports.stream = function stream(path, optimizerContext, reader) {
    var debugEnabled = logger.isDebugEnabled();

    if (!reader) {
        // no file reader provided so create one
        var pageOptimizer = optimizerContext && optimizerContext.optimizer;
        if (pageOptimizer) {
            // use DependencyRegistry in pageOptimizer to find the reader
            // based on the given path (which will likely pick a reader
            // based on the file extension)
            reader = pageOptimizer.dependencies.getRequireReader(path);

        }

        if (reader) {
            if (debugEnabled) {
                logger.debug('Found reader for "' + path + '"  from DependencyRegistry');
            }
        } else {
            // the default reader will read contents from disk
            reader = DEFAULT_READER;

        }
    }

    var readStream;

    function callback(err, data) {
        if (debugEnabled) {
            logger.debug('Callback for "' + path + '" invoked.');
        }

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

    var result = reader(path, optimizerContext, callback);
    if (result) {
        if (typeof result.then === 'function') {
            if (debugEnabled) {
                logger.debug('Reader for "' + path + '" returned promise.');
            }
            readStream = readStream || through();
            result.then(
                // success handler
                function(data) {
                    callback(null, data);
                },

                // error handler
                callback);
            return readStream;
        } else if (typeof result.pipe === 'function') {
            if (debugEnabled) {
                logger.debug('Reader for "' + path + '" returned stream.');
            }
            return result;
        } else {
            throw new Error('Invalid return: ' + result);
        }
    } else {
        if (debugEnabled) {
            logger.debug('Reader for "' + path + '" did not return stream. Expect callback to be invoked.');
        }
        // Callback will be used so return the stream
        // that will receive the data from the callback
        readStream = readStream || through();
        return readStream;
    }
};