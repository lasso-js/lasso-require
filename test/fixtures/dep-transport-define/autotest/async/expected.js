$_mod.def("/autotest$0/foo", function(require, exports, module, __filename, __dirname) { require('/lasso-loader$2.0.0/src/index'/*'lasso-loader'*/).async("_1", function() {
    var bar = require('/autotest$0/bar'/*'./bar'*/);
    bar.sayHello();
});
});