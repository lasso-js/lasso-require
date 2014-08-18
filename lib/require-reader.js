var fs = require('fs');
var logger = require('raptor-logging').logger(module);

function DEFAULT_READER(path, optimizerContext) {
    return fs.createReadStream(path, {encoding: 'utf8'});
}

/**
 * @param {String} path a path to a source file to read
 * @param {OptimizerContext} optimizerContext an optimizer context
 * @param {Function} reader an optional reader function (a function that returns a stream or invokes a callback)
 */
exports.stream = function(path, optimizerContext, reader) {
    var readStream = optimizerContext.deferredStream(function() {
        // this work is deferred until the stream is first read
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

        function onData(err, data) {
            if (debugEnabled) {
                logger.debug('Callback for "' + path + '" invoked.');
            }

            if (err) {
                readStream.emit('error', err);
                readStream.push(null);
                return;
            }

            readStream.push(data);
            readStream.push(null);
        }

        var result = reader(path, optimizerContext, onData);
        if (result) {
            if (typeof result.then === 'function') {
                if (debugEnabled) {
                    logger.debug('Reader for "' + path + '" returned promise.');
                }
                result.then(
                    // success handler
                    function(data) {
                        readStream.push(data);
                        readStream.push(null);
                    },

                    // error handler
                    onData);
                return readStream;
            } else if (typeof result.pipe === 'function') {
                if (debugEnabled) {
                    logger.debug('Reader for "' + path + '" returned stream.');
                }

                result.on('end', function() {
                    readStream.push(null);
                });

                result.on('data', function(data) {
                    readStream.push(data);
                });

                readStream.on('pause', function() {
                    result.pause();
                });

                readStream.on('resume', function() {
                    result.resume();
                });

                result.resume();
            } else {
                throw new Error('Invalid return: ' + result);
            }
        }
    });

    return readStream;
};