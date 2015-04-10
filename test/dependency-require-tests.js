'use strict';
require('../'); // Load the module
var nodePath = require('path');
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var MockLassoContext = require('./MockLassoContext');
var extend = require('raptor-util/extend');

require('../'); // Load this module just to make sure it works

var clientLassoPackagePath = require.resolve('raptor-modules/client/optimizer.json');

var mockLasso = {
    dependencies: {
        createDependency: function(d) {
            return d;
        }
    }
};

function MockDependency() {

}

MockDependency.prototype = {
    getParentManifestDir: function() {
        return this.__dirname;
    },

    getParentManifestPath: function() {
        return this.__filename;
    }
};

function createRequireDependency() {
    var d = new MockDependency();
    var requireDependency = require('../lib/dependency-require').create({rootDir: nodePath.join(__dirname, 'test-project')}, mockLasso);
    extend(d, requireDependency);
    return d;
}

function createDefDependency() {
    var d = new MockDependency();
    var def = require('../lib/dependency-define');
    extend(d, def);
    return d;
}

xdescribe('lasso-require/dependency-require' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }
        done();
    });

    it('should resolve to the correct lasso manifest for a "require" dependency that resolves to a root module', function(done) {
        var lassoContext = new MockLassoContext();
        var requireDependency = createRequireDependency();
        requireDependency.path = 'bar';
        requireDependency.from = nodePath.join(__dirname, 'test-project');
        requireDependency.init(lassoContext, function(err) {
            requireDependency.getDependencies(lassoContext, function(err, dependencies) {
                if (err) {
                    return done(err);
                }

                var lookup = {};

                expect(dependencies.length).to.equal(5);

                dependencies.forEach(function(d) {
                    lookup[d.type] = d;
                });

                // console.log(JSON.stringify(lookup['package'], null, ' '))

                // console.log(JSON.stringify({
                //     type: 'package',
                //     path: clientLassoPackagePath
                // }, null, ' '))


                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: clientLassoPackagePath
                });

                expect(lookup['commonjs-dep']).to.deep.equal({
                    type: 'commonjs-dep',
                    parentPath: '',
                    childName: 'bar',
                    childVersion: '2.0.0',
                    _sourceFile: nodePath.join(__dirname, 'test-project/node_modules/bar/lib/index.js')
                });

                expect(lookup['commonjs-main']).to.deep.equal({
                    type: 'commonjs-main',
                    dir: '/bar@2.0.0',
                    main: 'lib/index',
                    _sourceFile: nodePath.join(__dirname, 'test-project/node_modules/bar/lib/index.js')
                });

                expect(lookup.require).to.deep.equal({
                    type: 'require',
                    resolvedPath: nodePath.join(__dirname, 'test-project/node_modules/bar/lib/index.js')
                });
                done();
            });
        });
    });

    it('should resolve to the correct lasso manifest for a "require" dependency with a resolved path', function(done) {
        var lassoContext = new MockLassoContext();
        var requireDependency = createRequireDependency();
        requireDependency.resolvedPath = nodePath.join(__dirname, 'test-project/node_modules/bar/lib/index.js');
        requireDependency.init(lassoContext, function(err) {
            requireDependency.getDependencies(lassoContext, function(err, dependencies) {
                if (err) {
                    return done(err);
                }

                var lookup = {};

                expect(dependencies.length).to.equal(5);

                var requires = [];

                dependencies.forEach(function(d) {
                    delete d._reader;
                    delete d._inspectedFile;

                    if (d.type === 'require') {
                        requires.push(d);
                    }
                    else {
                        lookup[d.type] = d;
                    }
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: clientLassoPackagePath
                });

                var actual = extend({}, lookup['commonjs-def']);

                expect(actual._requireReader).to.be.a('function');

                delete actual._requireReader;

                expect(actual).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/bar@2.0.0/lib/index',
                    _file: nodePath.join(__dirname, 'test-project/node_modules/bar/lib/index.js'),
                    _requireLastModified: -1
                });

                expect(requires.length).to.equal(1);

                expect(requires).to.deep.equal([{
                        type: 'require',
                        path: 'baz',
                        from: nodePath.join(__dirname, 'test-project/node_modules/bar/lib')
                    }]);

                done();
            });
        });

    });

    it('should resolve to the correct lasso manifest for a "require" dependency that resolves to a nested installed module', function(done) {
        var lassoContext = new MockLassoContext();
        var requireDependency = createRequireDependency();
        requireDependency.path = 'baz';
        requireDependency.from = nodePath.join(__dirname, 'test-project/node_modules/bar');
        requireDependency.init(lassoContext, function(err) {
            requireDependency.getDependencies(lassoContext, function(err, dependencies) {
                if (err) {
                    return done(err);
                }

                var lookup = {};

                expect(dependencies.length).to.equal(5);

                dependencies.forEach(function(d) {
                    lookup[d.type] = d;
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: clientLassoPackagePath
                });

                expect(lookup['commonjs-dep']).to.deep.equal({
                    type: 'commonjs-dep',
                    parentPath: '/$/bar',
                    childName: 'baz',
                    childVersion: '3.0.0',
                    _sourceFile: nodePath.join(__dirname, 'test-project/node_modules/bar/node_modules/baz/lib/index.js')
                });

                expect(lookup['commonjs-main']).to.deep.equal({
                    type: 'commonjs-main',
                    dir: '/baz@3.0.0',
                    main: 'lib/index',
                    _sourceFile: nodePath.join(__dirname, 'test-project/node_modules/bar/node_modules/baz/lib/index.js')
                });

                expect(lookup.require).to.deep.equal({
                    type: 'require',
                    resolvedPath: nodePath.join(__dirname, 'test-project/node_modules/bar/node_modules/baz/lib/index.js')
                });
                done();
            });
        });
    });

    it('should resolve to the correct lasso manifest for a "require" dependency with a resolved path and a non-string require in code', function(done) {
        var lassoContext = new MockLassoContext();
        var requireDependency = createRequireDependency();
        requireDependency.resolvedPath = nodePath.join(__dirname, 'test-project/node_modules/foo/lib/index.js');
        requireDependency.init(lassoContext, function(err) {
            requireDependency.getDependencies(lassoContext, function(err, dependencies) {
                if (err) {
                    return done(err);
                }
                var lookup = {};

                expect(dependencies.length).to.equal(4);

                var requires = [];

                dependencies.forEach(function(d) {
                    delete d._reader;
                    if (d.type === 'require') {
                        requires.push(d);
                    }
                    else {
                        lookup[d.type] = d;
                    }

                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: clientLassoPackagePath
                });

                var actual = extend({}, lookup['commonjs-def']);

                expect(actual._requireReader).to.be.a('function');

                delete actual._requireReader;

                expect(actual).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/foo@1.0.0/lib/index',
                    _file: nodePath.join(__dirname, 'test-project/node_modules/foo/lib/index.js'),
                    _requireLastModified: -1
                });

                expect(requires.length).to.equal(0);

                done();
            });
        });
    });

    it('should resolve to the correct lasso manifest for a "require" dependency that has a browser module override', function(done) {
        var lassoContext = new MockLassoContext();
        var requireDependency = createRequireDependency();
        requireDependency.path = 'hello-world';
        requireDependency.from = nodePath.join(__dirname, 'test-project/browser-overrides/main');
        requireDependency.init(lassoContext, function(err) {
            requireDependency.getDependencies(lassoContext, function(err, dependencies) {
                if (err) {
                    return done(err);
                }
                var lookup = {};

                expect(dependencies.length).to.equal(5);

                dependencies.forEach(function(d) {
                    lookup[d.type] = d;
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: clientLassoPackagePath
                });

                expect(lookup['commonjs-dep']).to.deep.equal({
                    type: 'commonjs-dep',
                    parentPath: '/browser-overrides',
                    childName: 'hello-world',
                    childVersion: '9.9.9',
                    remap: 'hello-world-browserify',
                    _sourceFile: nodePath.join(__dirname, 'test-project/browser-overrides/node_modules/hello-world-browserify/index.js')
                });

                expect(lookup['commonjs-main']).to.deep.equal({
                    type: 'commonjs-main',
                    dir: '/hello-world-browserify@9.9.9',
                    main: 'index',
                    _sourceFile: nodePath.join(__dirname, 'test-project/browser-overrides/node_modules/hello-world-browserify/index.js')
                });

                expect(lookup.require).to.deep.equal({
                    type: 'require',
                    resolvedPath: nodePath.join(__dirname, 'test-project/browser-overrides/node_modules/hello-world-browserify/index.js')
                });

                done();
            });
        });
    });

    it('should resolve to the correct lasso manifest for a "require" dependency that has a browser file override', function(done) {
        var lassoContext = new MockLassoContext();
        var requireDependency = createRequireDependency();
        requireDependency.path = './browser-overrides/main/index';
        requireDependency.from = nodePath.join(__dirname, 'test-project');
        requireDependency.init(lassoContext, function(err) {
            requireDependency.getDependencies(lassoContext, function(err, dependencies) {
                if (err) {
                    return done(err);
                }
                var lookup = {};

                // console.log('DEPENDENCIES: ', dependencies);

                expect(dependencies.length).to.equal(4);

                dependencies.forEach(function(d) {
                    delete d._reader;
                    lookup[d.type] = d;
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: clientLassoPackagePath
                });

                var actual = extend({}, lookup['commonjs-def']);

                expect(actual._requireReader).to.be.a('function');

                delete actual._requireReader;

                expect(actual).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/browser-overrides/main/browser/index_browser',
                    _file: nodePath.join(__dirname, 'test-project/browser-overrides/main/browser/index_browser.js'),
                    _requireLastModified: -1
                });

                expect(lookup['commonjs-remap']).to.deep.equal({
                    type: 'commonjs-remap',
                    from: '/browser-overrides/main/index',
                    to: 'browser/index_browser',
                    _sourceFile: nodePath.join(__dirname, 'test-project/browser-overrides/main/browser/index_browser.js')
                });

                done();
            });
        });


    });

    it('should resolve to the correct lasso manifest for a "require" dependency that has an associated browser.json', function(done) {
        var lassoContext = new MockLassoContext();
        var requireDependency = createRequireDependency();
        requireDependency.path = './src/with-package/foo/index';
        requireDependency.from = nodePath.join(__dirname, 'test-project');
        requireDependency.init(lassoContext, function(err) {
            requireDependency.getDependencies(lassoContext, function(err, dependencies) {
                if (err) {
                    return done(err);
                }
                var lookup = {};

                expect(dependencies.length).to.equal(4);
                var pkgs = [];

                dependencies.forEach(function(d) {
                    delete d._reader;
                    if (d.type === 'package') {
                        pkgs.push(d);
                    }
                    else {
                        lookup[d.type] = d;
                    }

                });

                expect(pkgs[0]).to.deep.equal({
                    type: 'package',
                    path: clientLassoPackagePath
                });

                expect(pkgs[1]).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, 'test-project/src/with-package/foo/browser.json')
                });

                var actual = extend({}, lookup['commonjs-def']);

                expect(actual._requireReader).to.be.a('function');

                delete actual._requireReader;

                expect(actual).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/src/with-package/foo/index',
                    _file: nodePath.join(__dirname, 'test-project/src/with-package/foo/index.js'),
                    _requireLastModified: -1
                });

                done();
            });
        });
    });

    it('should support *.json requires', function(done) {

        var lassoContext = new MockLassoContext();
        var requireDependency = createRequireDependency();
        requireDependency.path = './test.json';
        requireDependency.__dirname = nodePath.join(__dirname, 'test-project/src');
        requireDependency.__filename = nodePath.join(__dirname, 'test-project/src/browser.json');
        requireDependency.init(lassoContext, function(err) {
            requireDependency.getDependencies(lassoContext, function(err, dependencies) {
                if (err) {
                    return done(err);
                }

                var lookup = {};

                expect(dependencies.length).to.equal(3);

                var requires = [];

                dependencies.forEach(function(d) {
                    delete d._reader;
                    delete d._inspectedFile;

                    if (d.type === 'require') {
                        requires.push(d);
                    }
                    else {
                        lookup[d.type] = d;
                    }
                });

                var actual = extend({}, lookup['commonjs-def']);

                expect(actual._requireReader).to.be.a('function');

                delete actual._requireReader;

                expect(actual).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/src/test',
                    _file: nodePath.join(__dirname, 'test-project/src/test.json'),
                    object: true,
                    _requireLastModified: -1
                });

                var defDependency = createDefDependency();
                extend(defDependency, lookup['commonjs-def']);

                var readStream = defDependency.read(lassoContext);
                var str = '';
                readStream.on('data', function(data) {
                    str += data;
                });
                readStream.on('end', function() {
                    expect(str).to.equal("$rmod.def(\"/src/test\", {\n    \"hello\": \"world\"\n});");
                    done();
                });
                readStream.resume();


            });
        });
    });

    it('should handle invalid requires to directories with no main', function(done) {
        var lassoContext = new MockLassoContext();
        var requireDependency = createRequireDependency();
        requireDependency.path = './no-main';
        requireDependency.__dirname = nodePath.join(__dirname, 'test-project/src');
        requireDependency.__filename = nodePath.join(__dirname, 'test-project/src/browser.json');
        requireDependency.init(lassoContext, function(err) {
            requireDependency.getDependencies(lassoContext, function(err, dependencies) {
                if (!err) {
                    done('Expected error argument.');
                } else {
                    done();
                }
            });
        });

    });

    // it.only('should resolve to the correct lasso manifest for a "require" dependency that has an associated -browser.json in dir', function(done) {
    //     var requireDependency = createRequireDependency();
    //     requireDependency.path = './src/with-package/bar/index';
    //     requireDependency.from = nodePath.join(__dirname, 'test-project');
    //     requireDependency.init(lassoContext, function(err) {);

    //     requireDependency.getDependencies(lassoContext, function(err, dependencies) {
    //         if (err) {
    //             return done(err);
    //         }
    //         var lookup = {};

    //         console.log('DEPENDENCIES: ', dependencies);

    //         expect(dependencies.length).to.equal(4);

    //         var pkgs = [];

    //         dependencies.forEach(function(d) {
    //             delete d._reader;
    //             if (d.type === 'package') {
    //                 pkgs.push(d);
    //             }
    //             else {
    //                 lookup[d.type] = d;
    //             }

    //         });

    //         expect(pkgs[0]).to.deep.equal({
    //             type: 'package',
    //             path: clientLassoPackagePath
    //         });

    //         expect(pkgs[1]).to.deep.equal({
    //             type: 'package',
    //             path: nodePath.join(__dirname, 'test-project/src/with-package/bar/index-browser.json')
    //         });

    //         expect(lookup['commonjs-def']).to.deep.equal({
    //             type: 'commonjs-def',
    //             path: '/src/with-package/bar/index',
    //             _file: nodePath.join(__dirname, 'test-project/src/with-package/bar/index.js')
    //         });

    //         done();
    //     });
    // });
});
