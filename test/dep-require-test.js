'use strict';


var nodePath = require('path');
var chai = require('chai');
chai.config.includeStack = true;
require('chai').should();
var MockLassoContext = require('./mock/MockLassoContext');
var relativizePaths = require('./util/relativizePaths');
var moduleSearchPath = require('./util/module-search-path');

var rootDir = nodePath.join(__dirname, '..');

describe('lasso-require/dependency-require' , function() {
    require('./autotest').scanDir(
        nodePath.join(__dirname, 'fixtures/dep-require/autotest'),
        function (dir, done) {

            var main = require(nodePath.join(dir, 'test.js'));

            var pluginConfig = main.getPluginConfig ? main.getPluginConfig() : {};
            pluginConfig.rootDir = dir;

            var dependencyFactory = require('./mock/dependency-factory').create(pluginConfig);

            var patchedSearchPath;
            if (main.searchPath) {
                patchedSearchPath = moduleSearchPath.patchSearchPath(main.searchPath);
            }

            var dependencyDef = main.createDependency(dir);
            var dependency = dependencyFactory.depRequire(dependencyDef);

            var lassoContext = new MockLassoContext();
            dependency.init(lassoContext);

            return Promise.resolve()
                .then(() => {
                    return dependency.getDependencies(lassoContext);
                })
                .then((dependencies) => {
                    dependencies = relativizePaths(dependencies, rootDir);
                    if (patchedSearchPath) {
                        patchedSearchPath.restore();
                    }

                    done(null, dependencies);
                })
                .catch((err) => {
                    if (patchedSearchPath) {
                        patchedSearchPath.restore();
                    }
                    done(err);
                });
        },
        {
            ext: '.json'
        });

});