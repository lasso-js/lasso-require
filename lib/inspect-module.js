var ok = require('assert').ok;
var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var parseOpts = {};

var shortCircuitRegExp = /require\(|require\.resolve\(|.async\(|#async|process/;

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
    if (isAsyncNode(node, scope)) {
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
        callbackNode = args[args.length-1];

        for (var i=0; i<args.length-1; i++) {
            var arg = args[i];
            var argObject = eval('(' + escodegen.generate(arg) + ')');
            addDependency(argObject);
        }

        return {
            node: node,
            dependencies: dependencies,
            args: args,
            callbackNode: callbackNode,
            toString: function() {
                return '[async: ' + this.name + ', dependencies=' + JSON.stringify(dependencies) + ']';
            }
        };
    }
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

function inspect(src, uniqueId) {
    ok(src != null, 'src is requried');
    ok(typeof uniqueId === 'function', 'uniqueId() function is required');

    if (shortCircuitRegExp.test(src) === false) {
        // Nothing of interest so nothing to do
        return {
            code: src
        };
    }

    var requiresLookup = {};
    var requires = [];
    var scopeStack = [{}];
    var asyncScopeStack = [];
    var asyncStack = [];
    var curAsyncInfo = null;
    
    var asyncBlocks = [];
    var processGlobal = false;

    var modified = false;



    var ast = esprima.parse(src, parseOpts);

    ast = estraverse.replace(ast, {
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

            var requireName;


            if (isRequire(node)) {
                requireName = node.arguments[0].value;
                if (asyncScopeStack.length) {
                    // We are in the scope of an async callback function so this
                    // is a dependency that will be lazily loaded
                    if (requireName !== 'raptor-loader') {
                        asyncScopeStack[asyncScopeStack.length-1].dependencies.push({
                            type: 'require',
                            path: requireName
                        });    
                    }
                } else {
                    // This is a non-async require
                    if (!requiresLookup[requireName]) {
                        requiresLookup[requireName] = true;
                        requires.push(requireName);
                    }    
                }
            } else if (node.type === 'CallExpression' &&
                node.callee.type === 'MemberExpression' &&
                node.callee.object.type === 'Identifier' &&
                node.callee.object.name === 'require' &&
                node.callee.property.type === 'Identifier' &&
                node.callee.property.name === 'resolve' &&
                node.arguments.length === 1 &&
                node.arguments[0].type === 'Literal') {

                requireName = node.arguments[0].value;
                requires.push(requireName);
            }

            var asyncInfo;
            if ((asyncInfo = parseAsyncNode(node, scopeStack[scopeStack.length-1]))) {
                curAsyncInfo = asyncInfo;
                asyncInfo.name = '_' + uniqueId();
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
                modified = true;
                var asyncInfo = asyncStack[asyncStack.length-1];
                // asyncInfo.node.callee.property.name = 'load';
                asyncInfo.node.arguments = asyncInfo.node.arguments.slice(-1); // Remove everything except for the callback node
                asyncInfo.node.arguments.unshift({ // Add the reference to the async metadata ID
                    type: 'Literal',
                    value: asyncInfo.name
                });
                asyncStack.pop();
            } else if (asyncScopeStack.length && node === asyncScopeStack[asyncScopeStack.length-1].callbackNode) {
                asyncScopeStack.pop();
            }
            
        }
    });

    var code = modified ? escodegen.generate(ast) : src;

    var async = null;

    if (asyncBlocks.length) {
        async = {};
        asyncBlocks.forEach(function(asyncInfo) {
            async[asyncInfo.name] = asyncInfo.dependencies;
        });
    }    

    return {
        code: code,
        requires: requires,
        processGlobal: processGlobal,
        async: async
    };
}

module.exports = inspect;