var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var parseOpts = {};

var shortCircuitRegExp = /require\(|.async\(|#async/;

function isRequire(node) {
    return node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal' &&
        typeof node.arguments[0].value === 'string';
}

function isRequireFor(node, moduleName) {
    return node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal' &&
        node.arguments[0].value === moduleName;
}

function isAsyncNode(node) {
    return node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.name === 'async' &&
        isRequireFor(node.callee.object, 'raptor-loader');
}

function parseAsyncNode(node) {
    if (isAsyncNode(node)) {
        var dependencies = [];
        var callbackNode = null;

        var addDependency = function(dependency) {
            if (Array.isArray(dependency)) {
                for (var i=0; i<dependency.length; i++) {
                    addDependency(dependency[i]);
                }
                return;
            } else {
                dependencies.push(dependency);
            }
        };

        var args = node.arguments;
        for (var i=0; i<args.length; i++) {
            var arg = args[i];
            if (arg.type === 'FunctionExpression') {
                callbackNode = arg;
            } else if (arg.type !== 'Identifier') {
                var argObject = eval('(' + escodegen.generate(arg) + ')');
                addDependency(argObject);
            }
        }

        return {
            node: node,
            dependencies: dependencies,
            args: args,
            callbackNode: callbackNode,
            toString: function() {
                return '[async: ' + this.varName + ', dependencies=' + JSON.stringify(dependencies) + ']';
            }
        };
    }
}

function inspect(src) {
    if (shortCircuitRegExp.test(src) === false) {
        // Nothing of interest so nothing to do
        return {
            code: src
        };
    }

    var requiresLookup = {};
    var requires = [];
    var asyncScopeStack = [];
    var asyncStack = [];
    var curAsyncInfo = null;
    var nextId = 0;
    var asyncBlocks = [];
    function uniqueId() {
        return '__async' + nextId++;
    }

    var ast = esprima.parse(src, parseOpts);
    ast = estraverse.replace(ast, {
        enter: function(node, parent) {
            if (isRequire(node)) {
                var requireName = node.arguments[0].value;
                if (asyncScopeStack.length) {
                    if (requireName !== 'raptor-loader') {
                        asyncScopeStack[asyncScopeStack.length-1].dependencies.push({
                            type: 'require',
                            path: requireName
                        });    
                    }
                } else {
                    if (!requiresLookup[requireName]) {
                        requiresLookup[requireName] = true;
                        requires.push(requireName);
                    }    
                }
            }

            var asyncInfo;
            if ((asyncInfo = parseAsyncNode(node))) {
                curAsyncInfo = asyncInfo;
                asyncInfo.varName = uniqueId();
                console.log('async node: ', node);
                asyncBlocks.push(asyncInfo);
                asyncStack.push(asyncInfo);
            } else if (curAsyncInfo && node === curAsyncInfo.callbackNode) {
                // We are in the scope of the async callback function so
                // all dependencies below this will be async
                asyncScopeStack.push(curAsyncInfo);
                curAsyncInfo = null;
            }
        },

        leave: function(node, parent) {
            if (asyncStack.length && node === asyncStack[asyncStack.length-1].node) {
                var asyncInfo = asyncStack[asyncStack.length-1];
                asyncInfo.node.callee.property.name = 'load';
                asyncInfo.node.arguments = asyncInfo.node.arguments.filter(function(arg) {
                    return arg.type === 'FunctionExpression' || arg.type === 'Identifier' ? true : false;
                });
                asyncInfo.node.arguments.unshift({
                    type: 'Identifier',
                    name: asyncInfo.varName
                });
                asyncStack.pop();
            } else if (asyncScopeStack.length && node === asyncScopeStack[asyncScopeStack.length-1].callbackNode) {
                asyncScopeStack.pop();
            }
            
        }
    });

    var code = escodegen.generate(ast);

    return {
        code: code,
        requires: requires,
        async: asyncBlocks.map(function(asyncInfo) {
            return {
                varName: asyncInfo.varName,
                dependencies: asyncInfo.dependencies
            };
        })
    };
}

module.exports = inspect;