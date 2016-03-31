require('raptor-loader').async(function() {
    var bar = require('./bar');
    bar.sayHello();
});