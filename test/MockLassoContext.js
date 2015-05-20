'use strict';

var fs = require('fs');
var nodePath = require('path');
var nextId = 0;

var Readable = require('stream').Readable;
var util = require('util');
var jsonReader = ('../lib/json-reader');

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

function MockLassoContext() {
    this.data = {};
    this.phaseData = {};
    var requireExtensions = {
        js: {
            object: false,
            createReader: function(path, lassoContext) {
                return function() {
                    return fs.createReadStream(path, {encoding: 'utf8'});
                };
            }
        },
        json: {
            object: true,
            createReader: function(path, lassoContext) {
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

                reader: requireExt.createReader(path, lassoContext),

                getLastModified: function(callback) {
                    callback(null, -1);
                }
            };
        }
    };
}

var MOCK_CACHE = {
    get: function(key, options, callback) {
        if (options.builder) {
            options.builder(callback);
        } else {
            callback();
        }
    },

    put: function(key, value, options) {

    }
};

MockLassoContext.prototype = {
    uniqueId: function() {
        return nextId++;
    },

    getFileLastModified: function(path, callback) {
        callback(null, -1);
    },

    cache: {
        getCache: function(name) {
            return MOCK_CACHE;
        }
    },

    isAsyncBundlingPhase: function() {
        return false;
    },

    cachingFs: {
        existsSync: function(filePath) {
            return fs.existsSync(filePath);
        }
    },

    deferredStream: function(startFn, options) {
        return new DeferredStream(startFn, options);
    }
};

module.exports = MockLassoContext;
