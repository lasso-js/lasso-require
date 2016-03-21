var logger = require('raptor-logging').logger(module);
var crypto = require('crypto');
var ok = require('assert').ok;
var PassThrough = require('stream').PassThrough;
var inspect = require('util').inspect;

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

        this.names[i] = transformFunc.id || transformFunc.name;

        shasum.update(transformId);
    }

    this.id = shasum.digest('hex');
}

Transforms.prototype.apply = function(path, inStream, lassoContext) {

    ok(inStream, 'inStream is required');
    var transforms = this._transforms;
    var names = this.names;

    var len = transforms.length;
    if (!len) {
        // If there are no transforms then just return the input stream
        return inStream;
    }

    function applyTransform(input, transformFunc) {
        return input.pipe(transformFunc(path));
    }

    return lassoContext.deferredStream(function() {
        var deferredStream = this;

        function handleError(e) {
            deferredStream.emit('error', e);
            deferredStream.push(null); // End the stream just in case
        }

        inStream.on('error', handleError);

        var passThrough = new PassThrough({encoding: 'utf8'});

        var out = passThrough;

        for (var i=0, len=transforms.length; i<len; i++) {
            var transformFunc = transforms[i];
            if (logger.isDebugEnabled()) {
                logger.debug('Applying transform ' + names[i]);
            }

            // applyTransform will return a new stream that we can read from
            out = applyTransform(out, transformFunc);

            if (typeof out.pipe !== 'function') {
                return handleError(new Error('Non-stream object returned from transform (transform=' + inspect(transformFunc) + ', output=' + inspect(out) + ')'));
            }

            out.on('error', handleError);
        }

        // Now start the flow of data at the source by piping the input stream
        // to the beginning of our transform chain (i.e. the initial pass thorugh stream)
        inStream.pipe(passThrough);

        return out;
    });
};

module.exports = Transforms;
