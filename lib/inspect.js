var ok = require('assert').ok;
var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var logger = require('raptor-logging').logger(module);
var through = require('through');
var raptorModulesUtil = require('raptor-modules/util');
var extend = require('raptor-util/extend');

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


function parseAsyncNode(node, scope, filePath) {
    if (!isAsyncNode(node, scope)) {
        return;
    }

    var args = node.arguments;
    var numArguments = args.length;
    if (numArguments < 1) {
        return;
    }

    var dependencies = [];

    if (numArguments > 1) {
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
        dependencies: dependencies,
        args: args,
        callbackNode: callbackNode,
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

function inspectSource(src, uniqueId, filePath) {
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
    var async = null;

    var ast;
    try {
        ast = esprima.parse(src, parseOpts);
    } catch(err) {
        // Don't fail if there is a parsing error but at least let the developer know
        logger.warn('Error parsing JavaScript file', filePath, err);
        return {
            modified: modified,
            code: src,
            requires: requires,
            processGlobal: processGlobal,
            async: async
        };
    }

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
            if ((asyncInfo = parseAsyncNode(node, scopeStack[scopeStack.length-1], filePath))) {
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

    if (asyncBlocks.length) {
        async = {};
        asyncBlocks.forEach(function(asyncInfo) {
            async[asyncInfo.name] = asyncInfo.dependencies;
        });
    }

    return {
        // let the caller know if we made changes to the source code
        modified: modified,

        // the source code which may or may not have been modified
        code: code,
        requires: requires,
        processGlobal: processGlobal,
        async: async
    };
}

function inspectStream(stream, path, optimizerContext, callback) {
    var debugEnabled = logger.isDebugEnabled();

    if (debugEnabled) {
        logger.debug('Inspect source for ' + path);
    }

    // read in the source code

    var src = '';
    var captureStream = through(
        function write(data) {
            src += data;
        },
        function end() {
            if (logger.isDebugEnabled()) {
                logger.debug('Read ' + path + '.');
            }
            // inspectModule will return the following:
            //   modified: Was the source code modified as a result of inspection?
            //   code: The resultant source code (possible different from the input source code)
            //   requires: Array of required dependencies
            //   processGlobal: Is global process needed? (true/false)
            //   async: Array of asynchronous dependencies
            var inspect = inspectSource(src, optimizerContext.uniqueId, path);

            if (debugEnabled) {
                logger.debug('Inspection of ' + path + ': ' + JSON.stringify({
                    requires: inspect.requires,
                    async: inspect.async,
                    transformed: inspect.transformed
                }));
            }

            if (debugEnabled) {
                logger.debug('Inspect source completed for ' + path);
            }
            // provide the callback with the value for caching (does not include reader)
            callback(null, {
                requires: inspect.requires,
                async: inspect.async,
                processGlobal: inspect.processGlobal,
                code: src
            });
        });

    captureStream.on('error', function(err) {
        callback(err);
    });
    stream.pipe(captureStream);
}

// Export for testability
exports.inspectSource = inspectSource;

exports.inspectCached = function (path, reader, getLastModified, optimizerContext, config, callback) {
    var debugEnabled = logger.isDebugEnabled();

    ok(path, '"path" is required');
    ok(reader, '"reader" is required');
    ok(getLastModified, '"getLastModified" is required');
    ok(optimizerContext, '"optimizerContext" is required');
    ok(config, '"config" is required');
    ok(callback, '"callback" is required');

    ok(typeof path === 'string', '"path" should be a string');
    ok(typeof reader === 'function', '"reader" should be a function');
    ok(typeof getLastModified === 'function', '"getLastModified" should be a function');
    ok(typeof optimizerContext === 'object', '"optimizerContext" should be an object');
    ok(typeof config === 'object', '"config" should be an object');
    ok(typeof callback === 'function', '"callback" should be a function');

    var cacheKey = path;

    var projectRootDir = config.rootDir || raptorModulesUtil.getProjectRootDir(path);
    if (path.startsWith(projectRootDir)) {
        cacheKey = '$APP_ROOT' + cacheKey.substring(projectRootDir.length);
    }

    // Other plugins can piggy back off this plugin to transport compiled/generated CommonJS
    // modules to the browser. If so, they may want to provide their own function for
    // calculating the last modified time of their CommonJS module

    // determined the last modified of the source file that we are inspecting
    getLastModified(function(err, lastModified) {
        var transformsId = config.transforms ? '/' + config.transforms.id : '';

        // Get or create the required caches
        var inspectCache = optimizerContext.data['raptor-optimizer-require/inspect'];
        if (!inspectCache) {
            inspectCache = optimizerContext.data['raptor-optimizer-require/inspect'] = optimizerContext.cache.getCache(
                    'raptor-optimizer-require/inspect' + transformsId, // <-- Unique cache name based on the set of enabled require transforms
                    'raptor-optimizer-require/inspect');               // <-- Name of the cache configuration to use
        }

        var code;

        function builder(callback) {
            var stream = reader();

            inspectStream(stream, path, optimizerContext, function(err, inspect) {
                if (err) {
                    return callback(err);
                }

                if (debugEnabled) {
                    logger.debug('Inspect source completed for ' + path);
                }

                // Don't put the code into the cache, but assign it to a variable
                // so that we can pass it along
                code = inspect.code;

                // provide the callback with the value for caching (does not include reader)
                callback(null, {
                    requires: inspect.requires,
                    async: inspect.async,
                    processGlobal: inspect.processGlobal
                });
            });
        }

        // try to read the inspect result from the cache
        inspectCache.get(
            cacheKey,
            {
                lastModified: lastModified,
                builder: builder
            },
            function(err, inspect) {
                if (err) {
                    logger.error('Error inspecting source', err);
                    // error happened in builder so reject the promise
                    return callback(err);
                }

                if (debugEnabled) {
                    logger.debug('Inspection result for ' + path + ': ' + JSON.stringify(inspect));
                }

                inspect = extend({}, inspect);
                inspect.lastModified = lastModified;
                inspect.reader = reader;

                if (code) {
                    // If code is non-null then that means that the builder needed to be invoked to read
                    // the require dependency to inspect the source. Since we had to read the dependency let's
                    // also provide the code so that we don't need to re-read it to generate the final
                    // output bundle
                    inspect.reader = function() {
                        return optimizerContext.deferredStream(function() {
                            this.push(code);
                            this.push(null);
                        });
                    };
                    callback(null, inspect);

                } else {
                    // there have been issues with stack size getting too big when inspect cache returns immediately
                    // so we only invoke callback immediately if we know that there was a cache miss

                    process.nextTick(function() {
                        callback(null, inspect);
                    });
                }

            });
    });
};
