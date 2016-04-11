var ok = require('assert').ok;
var logger = require('raptor-logging').logger(module);
var streamToString = require('./util/streamToString');
var inspect = require('./util/inspect');
var clone = require('clone');
var raptorModulesUtil = require('raptor-modules/util');

exports.inspectCached = function (path, reader, getLastModified, lassoContext, config, callback) {
    var debugEnabled = logger.isDebugEnabled();

    ok(path, '"path" is required');
    ok(reader, '"reader" is required');
    ok(getLastModified, '"getLastModified" is required');
    ok(lassoContext, '"lassoContext" is required');
    ok(config, '"config" is required');
    ok(callback, '"callback" is required');

    ok(typeof path === 'string', '"path" should be a string');
    ok(typeof reader === 'function', '"reader" should be a function');
    ok(typeof getLastModified === 'function', '"getLastModified" should be a function');
    ok(typeof lassoContext === 'object', '"lassoContext" should be an object');
    ok(typeof config === 'object', '"config" should be an object');
    ok(typeof callback === 'function', '"callback" should be a function');

    // Get or create the required caches
    var transformsId = config.transforms ? '/' + config.transforms.id : '';
    var inspectCache = lassoContext.data['lasso-require/inspect'];
    if (!inspectCache) {
        inspectCache = lassoContext.data['lasso-require/inspect'] = lassoContext.cache.getCache(
                // Unique cache name based on the set of enabled require transforms:
                'lasso-require/inspect' + (transformsId ? '-' + transformsId : ''), // NOTE: ".1" is just needed for cache busting old versions
                // Name of the cache configuration to use:
                'lasso-require/inspect');
    }

    function handleError(err) {
        callback(err);
        return;
    }

    var src;
    var cacheKey;
    var lastModified;

    function readSource(callback) {
        if (src) {
            //We have already read in the source code for the require so just return that!
            return callback(null, src);
        }

        // Otherwise, let's read in the stream into a string value and invoke the callback when it is done.
        var stream = reader();
        streamToString(stream, callback);
    }

    // Inspecting a JavaScript file is expensive since it requires parsing the JavaScript to find all of the
    // requires. We really don't want to do that every time so we *always* calculate a cache key for the
    // the dependency. In the normal case we use the "lastModiifed" time for the require, but in case where
    // that is not available then we read in the JavaScript code for the require and calculate a fingerprint
    // on the provided source and use that as a cache key.

    /**
     * This method does the final inspection after we have calculated the cache key.
     * At this point we may or may not have actually read in the source for the require.
     * @return {[type]} [description]
     */
    function doInspect() {
        ok(cacheKey);

        // try to read the inspect result from the cache
        inspectCache.get(
            cacheKey,
            {
                lastModified: lastModified && lastModified > 0 ? lastModified : undefined,
                builder: function(callback) {
                    readSource(function(err, _src) {
                        if (err) {
                            return handleError(err);
                        }

                        src = _src;

                        inspect(src, function(err, inspectResult) {
                            if (err) {
                                logger.warn('Error parsing JavaScript file', path, err, '\n\nSource:\n-------\n' + src + '\n-------\n');
                                return callback(null, {});
                            }

                            callback(null, inspectResult);
                        });
                    });
                }
            },
            function(err, inspectResult) {

                if (err) {
                    logger.error('Error inspecting source', err);
                    // error happened in builder so reject the promise
                    return callback(err);
                }

                if (debugEnabled) {
                    logger.debug('Inspection result for ' + path + ': ' + JSON.stringify(inspect));
                }

                // Clone the result that is returned out of the cache since we need to modify some
                // of the data.
                inspectResult = clone(inspectResult);
                inspectResult.lastModified = lastModified || -1;

                if (src) {
                    // If src is non-null then that means that the builder needed to be invoked to read
                    // the require dependency to inspect the source. Since we had to read the dependency let's
                    // also provide the src so that we don't need to re-read it to generate the final
                    // output bundle
                    inspectResult.reader = function() {
                        return lassoContext.deferredStream(function() {
                            this.push(src);
                            this.push(null);
                        });
                    };
                    callback(null, inspectResult);

                } else {
                    inspectResult.reader = reader;

                    // there have been issues with stack size getting too big when inspect cache returns immediately
                    // so we only invoke callback immediately if we know that there was a cache miss
                    process.nextTick(function() {
                        callback(null, inspectResult);
                    });
                }
            });
    }

    function buildCacheKeyFromFingerprint() {
        // We are going to need to read in the source code for the require to calculate the fingerprint.
        // We will use the fingerprint as a cache key to avoid having to inspect the JavaScript in the
        // case where there is cache hit. Since we have already read in the source this won't need to be
        // done later in the pipeline.
        src = '';
        var fingerprint = null;

        var stream = reader();
        var fingerprintStream = lassoContext.createFingerprintStream();

        fingerprintStream
            .on('fingerprint', function(_fingerprint) {
                fingerprint = _fingerprint;
            })
            .on('data', function(data) {
                src += data;
            })
            .on('end', function() {
                cacheKey = fingerprint;
                doInspect();
            })
            .on('error', handleError);

        stream
            .on('error', handleError)
            .pipe(fingerprintStream);
    }

    function buildCacheKeyFromPath() {
        // We will use the path associated with the require as the cache key and
        // since we have a valid last modified time that is going to be good enough.
        cacheKey = path;

        var projectRootDir = config.rootDir || raptorModulesUtil.getProjectRootDir(path);
        if (path.startsWith(projectRootDir)) {
            cacheKey = '$APP_ROOT' + cacheKey.substring(projectRootDir.length);
        }

        doInspect();
    }

    getLastModified(function(err, _lastModified) {
        if (err) {
            return handleError(err);
        }

        lastModified = _lastModified;

        if (!lastModified || lastModified < 0) {
            lastModified = undefined;
        }

        if (lastModified) {
            buildCacheKeyFromPath();
        } else {
            buildCacheKeyFromFingerprint();
        }
    });

};