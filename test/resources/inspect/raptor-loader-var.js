var raptorLoader = require('raptor-loader');

exports.test = function(input) {

    raptorLoader.async(['./optimizer.json'], function(err) {
        require('baz');

        raptorLoader.async(function(err) {
            require('cat');
        });
    });
}