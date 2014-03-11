var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var parseOpts = {};

var shortCircuitRegExp = /require\(|.async\(|#async/;
function inspect(src) {
    if (shortCircuitRegExp.test(src) === false) {
        // Nothing of interest so nothing to do
        return {
            code: src
        };
    }

    var ast = esprima.parse(src, parseOpts);
    ast = estraverse.replace(ast, {
        enter: function(node, parent) {
        },

        leave: function(node, parent) {
            if (node.type === 'CallExpression' &&
                node.callee.type === 'Identifier' &&
                node.callee.name === 'require' &&
                node.arguments.length === 1 &&
                node.arguments[0].type === 'Literal' &&
                typeof node.arguments[0].value === 'string') {
                
                var target = node.arguments[0].value;
                
            }

        }
    });

    return ast;

}

module.exports = inspect;