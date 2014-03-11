$rmod.def("/foo@1.0.0/lib/index", function(require, exports, module, __filename, __dirname) { exports.foo = "1.0.0";
var target = "baz";
require(target); });
$rmod.dep("", "foo", "1.0.0");
$rmod.main("/foo@1.0.0", "lib/index");
$rmod.def("/amd-module", function(require, exports, module, __filename, __dirname) { var foo = require('foo');
exports.action = function () {
}; });