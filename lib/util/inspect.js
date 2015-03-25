var esprima = require('esprima');
var estraverse = require('estraverse');
var ok = require('assert').ok;

var parseOpts = {
    range: true
};

var shortCircuitRegExp = /require\(|require\.resolve\(|.async\(|#async|process/;

function isRequire(node) {
    return node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal' &&
        typeof node.arguments[0].value === 'string';
}

function isRequireResolve(node) {
    return node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'require' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'resolve' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal';
}

function isRequireFor(node, moduleName) {
    return node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal' &&
        node.arguments[0].value === moduleName;
}

function isAsyncNode(node, scope) {
    if (!node.arguments || !node.arguments.length) {
        return false;
    }

    if (node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'async' &&
        isRequireFor(node.callee.object, 'raptor-loader')) {
        return true;
    }

    if (node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'async' &&
        node.callee.object.type === 'Identifier' &&
        scope[node.callee.object.name] === 'raptor-loader') {
        return true;
    }

    return false;
}


function parseAsyncNode(node, scope) {
    if (!isAsyncNode(node, scope)) {
        return;
    }

    var args = node.arguments;
    var numArguments = args.length;
    if (numArguments < 1) {
        return;
    }

    var dependencies = [];
    var hasInlineDependencies = false;

    if (numArguments > 1) {
        hasInlineDependencies = true;
        var firstArg = args[0];

        // We only care if about the async calls if the first argument is an array
        if (firstArg.type !== 'ArrayExpression') {
            // call is something like:
            //    require('raptor-loader').async('somePackageId', callback)
            //    require('raptor-loader').async(someVariable, callback)
            return;
        }

        var elems = firstArg.elements;
        for (var i = 0; i < elems.length; i++) {
            dependencies.push(elems[i].value);
        }
    }

    var callbackNode = args[numArguments - 1];

    return {
        node: node,
        requires: [],
        dependencies: dependencies,
        args: args,
        callbackNode: callbackNode,
        firstArgRange: args[0].range,
        hasInlineDependencies: hasInlineDependencies,
        toString: function() {
            return '[async: ' + this.name + ', dependencies=' + JSON.stringify(dependencies) + ']';
        }
    };
}

function isProcessGlobalReference(node, scope) {


    if (scope.process === 'process') {
        return false; // There is a local "process" variable in the scope
    }

    if (node.type === 'Identifier' &&
        node.name === 'process') {
        return true;
    } else if (node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'process') {
        return true;
    }
}

module.exports = function inspect(src, callback) {
    ok(src != null, 'src is requried');

    if (shortCircuitRegExp.test(src) === false) {
        // Nothing of interest so nothing to do
        return callback(null, {
            requires: [],
            processGlobal: false,
            asyncBlocks: []
        });
    }

    var requires = [];
    var scopeStack = [{}];
    var asyncScopeStack = [];
    var asyncStack = [];
    var curAsyncInfo = null;
    var asyncBlocks = [];
    var processGlobal = false;

    var ast;
    try {
        ast = esprima.parse(src, parseOpts);
    } catch(err) {
        var friendlyError = new Error(err.toString());
        return callback(friendlyError);
    }

    ast = estraverse.traverse(ast, {
        enter: function(node, parent) {
            if (node.type === 'VariableDeclaration') {
                node.declarations.forEach(function(varDecl) {
                    if (varDecl.init && isRequireFor(varDecl.init, 'raptor-loader')) {
                        scopeStack[scopeStack.length-1][varDecl.id.name] = 'raptor-loader';
                    }

                    if (varDecl.id.name === 'process') {
                        scopeStack[scopeStack.length-1][varDecl.id.name] = 'process';
                    }
                });
            } else if (node.type === 'FunctionExpression') {
                scopeStack.push(Object.create(scopeStack[scopeStack.length-1]));
            }

            if (isProcessGlobalReference(node, scopeStack[scopeStack.length-1])) {
                processGlobal = true;
            }

            var requirePath;



            if (isRequire(node) || isRequireResolve(node)) {
                requirePath = node.arguments[0].value;

                var range;

                if (parent.type === 'ExpressionStatement') {
                    range = parent.range;
                }

                var firstArgRange = node.arguments[0].range;

                if (asyncScopeStack.length) {
                    // We are in the scope of an async callback function so this
                    // is a dependency that will be lazily loaded
                    if (requirePath !== 'raptor-loader') {
                        var lastAsyncInfo = asyncScopeStack[asyncScopeStack.length-1];

                        lastAsyncInfo.requires.push({
                            path: requirePath,
                            range: range,
                            argRange: firstArgRange
                        });

                        lastAsyncInfo.dependencies.push({
                            type: 'require',
                            path: requirePath
                        });
                    }
                } else {
                    requires.push({
                        path: requirePath,
                        range: range,
                        argRange: firstArgRange
                    });
                }
            }

            var asyncInfo;
            if ((asyncInfo = parseAsyncNode(node, scopeStack[scopeStack.length-1]))) {
                curAsyncInfo = asyncInfo;
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
            if (node.type === 'FunctionExpression') {
                scopeStack.pop();
            }

            if (asyncStack.length && node === asyncStack[asyncStack.length-1].node) {
                asyncStack.pop();
            } else if (asyncScopeStack.length && node === asyncScopeStack[asyncScopeStack.length-1].callbackNode) {
                asyncScopeStack.pop();
            }
        }
    });

    callback(null, {
        requires: requires,
        processGlobal: processGlobal,
        asyncBlocks: asyncBlocks
    });
};