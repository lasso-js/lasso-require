var logger = require('raptor-logging').logger(module);
var crypto = require('crypto');

function Transforms(transforms) {
    this.names = new Array(transforms.length);

    this._transforms = transforms;

    var shasum = crypto.createHash('sha1');
    
    for (var i=0, len=transforms.length; i<len; i++) {

        var transformFunc = transforms[i];

        var transformId;

        if (typeof transformFunc === 'string') {
            transformId = transformFunc;
            transformFunc = require(transformId);
            transforms[i] = transformFunc;
        } else {
            transformId = transformFunc.id || transformFunc.toString();
        }

        shasum.update(transformId);
    }

    this.id = shasum.digest('hex');
}

Transforms.prototype.apply = function(path, inStream) {
    var transforms = this._transforms;

    var len = transforms.length;
    if (!len) {
        return;
    }

    var out;
    var firstTransformStream;

    for (var i=0; i<len; i++) {
        var transformFunc = transforms[i];
        if (logger.isDebugEnabled()) {
            logger.debug('Applying transform ' + this.names[i]);
        }
        if (out) {
            out = out.pipe(transformFunc(path));
        } else {
            out = firstTransformStream = transformFunc(path);
        }
    }

    process.nextTick(function() {
        // Wait until next tick to start the flow of data so that we have a chance
        // to add listeners
        inStream.pipe(firstTransformStream);
    });

    return out;
};

module.exports = Transforms;