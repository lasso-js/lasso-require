'use strict';

var fs = require('fs');
var nodePath = require('path');
var nextId = 0;
var lassoCachingFS = require('lasso-caching-fs');

var Readable = require('stream').Readable;
var util = require('util');
var fingerprintStream = require('./fingerprint-stream');
var MockMemoryCache = require('./MockMemoryCache');

function noop() {}

function DeferredStream(startFn, options) {
    var self = this;

    Readable.call(this, options);

    // When _read is called, we need to start pushing data
    self._read = function() {
        self._read = noop;
        var stream = startFn.call(self);
        if (stream) {
            stream
                .on('data', function(data) {
                    self.push(data);
                })
                .on('end', function() {
                    self.push(null);
                })
                .on('error', function(err) {
                    self.emit('error', err);
                })
                .resume();
        }
    };

    return self;
}

util.inherits(DeferredStream, Readable);

module.exports = DeferredStream;

var MOCK_CACHE = {
    get: function(key, options) {
        return new Promise((resolve, reject) => {
            if (options.builder) {
                resolve(options.builder());
            } else {
                resolve();
            }
        });
    },

    put: function(key, value, options) {

    }
};

class MockLassoContext {
    constructor() {
        this.data = {};
        this.phaseData = {};
        var requireExtensions = {
            js: {
                object: false,
                createReadStream: function(path, lassoContext) {
                    return function() {
                        return fs.createReadStream(path, {encoding: 'utf8'});
                    };
                }
            },
            json: {
                object: true,
                createReadStream: function(path, lassoContext) {
                    return function() {
                        return fs.createReadStream(path, {encoding: 'utf8'});
                    };
                }
            }
        };

        this.dependencyRegistry = {
            getRequireHandler: function(path, lassoContext) {
                var ext = nodePath.extname(path).substring(1);
                var requireExt = requireExtensions[ext];
                return {
                    object: requireExt.object === true,

                    createReadStream: requireExt.createReadStream(path, lassoContext),

                    getLastModified: function() {
                        return Promise.resolve(-1);
                    }
                };
            }
        };

        var mockCaches = this.mockCaches = {};

        this.cache = {
            getCache(name) {
                return mockCaches[name] || MOCK_CACHE;
            }
        };
    }

    mockEnableCachingForCache(cacheName) {
        this.mockCaches[cacheName] = new MockMemoryCache();
    }

    uniqueId() {
        return nextId++;
    }

    getFileLastModified(path) {
        return Promise.resolve(-1);
    }

    isAsyncBundlingPhase() {
        return false;
    }

    get cachingFs() {
        return lassoCachingFS;
    }

    deferredStream(startFn, options) {
        return new DeferredStream(startFn, options);
    }

    createFingerprintStream() {
        return fingerprintStream.create();
    }
}

module.exports = MockLassoContext;
