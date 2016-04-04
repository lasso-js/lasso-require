var ok = require('assert').ok;
var Transforms = require('./util/Transforms');
var extend = require('raptor-util').extend;
var builtins = require('./builtins');
var resolve = require('./util/resolve');
var defaultGlobals = {
    'jquery': ['$', 'jQuery']
};
var lassoModulesClientTransport = require('lasso-modules-client/transport');
var getClientPath = lassoModulesClientTransport.getClientPath;
var lassoResolveFrom = require('lasso-resolve-from');

function resolveGlobals(config) {
    var globals = config.globals;
    if (globals) {
        globals = extend({}, config.globals);
    } else {
        globals = {};
    }

    Object.keys(defaultGlobals).forEach(function(moduleName) {
        var varNames = defaultGlobals[moduleName];
        var resolved = lassoResolveFrom(config.rootDir, moduleName);

        if (resolved) {
            globals[resolved.path] = varNames;
        }

    });

    config.globals = globals;
}

function buildPluginConfig(userConfig, defaultProjectRoot) {
    var config = userConfig ? extend({}, userConfig) : {};

    config.rootDir = config.rootDir || defaultProjectRoot || process.cwd();



    ok(config.rootDir, '"rootDir" is required');

    config.runImmediately = config.runImmediately === true;
    config.builtins = builtins.getBuiltins(config.builtins);

    config.getClientPath = getClientPath;

    var resolver =  config.resolver = resolve.createResolver(config.builtins, getClientPath);

    var babelConfig = {
    };

    if (userConfig.babel) {
        extend(babelConfig, userConfig.babel);
    }

    babelConfig.extensions = babelConfig.extensions || ['es6'];

    config.babel = babelConfig;

    var babelConfigFinalized = false;
    /**
     * Lazily load the babel presets... it takes a long time!
     */
    config.getBabelConfig = function() {
        if (!babelConfigFinalized) {
            babelConfigFinalized = true;

            console.log(module.id, 'Loading babel preset:', new Error().stack);

            delete babelConfig.extensions;

            if (!babelConfig.presets) {
                babelConfig.presets = [require('babel-preset-es2015')];
            }
        }
        return babelConfig;
    };

    var transforms;
    if (config.transforms) {
        if (config.transforms.length > 0) {
            config.transforms = transforms = new Transforms(config.transforms);
        } else {
            config.transforms = undefined;
        }
    }


    resolveGlobals(config, resolver);

    if (config.modulesRuntimeGlobal) {
        if (!config.unbundledTargetPrefix) {
            // Use the modules global variable name as the unbundled
            // target prefix (it will get sanitized later)
            config.unbundledTargetPrefix = config.modulesRuntimeGlobal;
        }

        // Sanitize the global variable name
        config.modulesRuntimeGlobal =
            config.modulesRuntimeGlobal.replace(/[^a-zA-Z0-9\_\$]+/g, '_');
    } else {
        // Use empty string simply because this used as part of the read
        // cache key for "commonjs-def" dependencies.
        config.modulesRuntimeGlobal = '';
    }

    var prefix;
    if ((prefix = config.unbundledTargetPrefix)) {
        // Build a friendly looking prefix which is used to create
        // nested directories when module output files are not bundled.
        prefix = prefix.replace(/[^a-zA-Z0-9\_]+/g, '-');

        // remove any leading and trailing "-" characters that may
        // have been created and store the result
        config.unbundledTargetPrefix =
            prefix.replace(/^-+/, '').replace(/-+$/, '');
    }

    return config;
}

module.exports = buildPluginConfig;