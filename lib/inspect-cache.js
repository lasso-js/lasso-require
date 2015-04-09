var ok = require('assert').ok;
var raptorModulesUtil = require('raptor-modules/util');
var logger = require('raptor-logging').logger(module);
var streamToString = require('./util/streamToString');
var inspect = require('./util/inspect');
var clone = require('clone');

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

    var cacheKey = path;

    var projectRootDir = config.rootDir || raptorModulesUtil.getProjectRootDir(path);
    if (path.startsWith(projectRootDir)) {
        cacheKey = '$APP_ROOT' + cacheKey.substring(projectRootDir.length);
    }

    // Other plugins can piggy back off this plugin to transport compiled/generated CommonJS
    // modules to the browser. If so, they may want to provide their own function for
    // calculating the last modified time of their CommonJS module

    // determined the last modified of the source file that we are inspecting
    getLastModified(function(err, lastModified) {
        var transformsId = config.transforms ? '/' + config.transforms.id : '';

        // Get or create the required caches
        var inspectCache = lassoContext.data['lasso-require/inspect'];
        if (!inspectCache) {
            inspectCache = lassoContext.data['lasso-require/inspect'] = lassoContext.cache.getCache(
                    // Unique cache name based on the set of enabled require transforms:
                    'lasso-require/inspect.1' + (transformsId ? '-' + transformsId : ''), // NOTE: ".1" is just needed for cache busting old versions
                    // Name of the cache configuration to use:
                    'lasso-require/inspect');
        }

        var code;

        function builder(callback) {
            var stream = reader();

            streamToString(stream, function(err, src) {
                if (err) {
                    return callback(err);
                }

                code = src;

                inspect(src, function(err, inspectResult) {
                    if (err) {
                        logger.warn('Error parsing JavaScript file', path, err, '\n\nSource:\n-------\n' + src + '\n-------\n');
                        return callback(null, {});
                    }

                    callback(null, inspectResult);
                });
            });
        }

        // try to read the inspect result from the cache
        inspectCache.get(
            cacheKey,
            {
                lastModified: lastModified,
                builder: builder
            },
            function(err, inspect) {

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
                inspect = clone(inspect);

                inspect.lastModified = lastModified;
                inspect.reader = reader;

                if (code) {
                    // If code is non-null then that means that the builder needed to be invoked to read
                    // the require dependency to inspect the source. Since we had to read the dependency let's
                    // also provide the code so that we don't need to re-read it to generate the final
                    // output bundle
                    inspect.reader = function() {
                        return lassoContext.deferredStream(function() {
                            this.push(code);
                            this.push(null);
                        });
                    };
                    callback(null, inspect);

                } else {
                    // there have been issues with stack size getting too big when inspect cache returns immediately
                    // so we only invoke callback immediately if we know that there was a cache miss

                    process.nextTick(function() {
                        callback(null, inspect);
                    });
                }

            });
    });
};