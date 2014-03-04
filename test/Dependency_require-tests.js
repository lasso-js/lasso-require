'use strict';
require('../'); // Load the module
var nodePath = require('path');
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var fs = require('fs');

require('../'); // Load this module just to make sure it works

describe('raptor-modules/optimizer/Dependency_require' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }
        done();
    });

    it('should resolve to the correct optimizer manifest for a "require" dependency that resolves to a root module', function(done) {


        var requireDependency = require('../lib/Dependency_require');
        requireDependency.path = "bar";
        requireDependency.from = nodePath.join(__dirname, 'test-project');
        requireDependency.init();

        requireDependency.getDependencies()
            .then(function(dependencies) {
                var lookup = {};

                expect(dependencies.length).to.equal(4);

                dependencies.forEach(function(d) {
                    lookup[d.type] = d;
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, '../../client/optimizer.json'),
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
            })
            .fail(done);
    });

    it('should resolve to the correct optimizer manifest for a "require" dependency with a resolved path', function(done) {

        var requireDependency = require('../lib/Dependency_require');
        requireDependency.resolvedPath = nodePath.join(__dirname, 'test-project/node_modules/bar/lib/index.js');
        requireDependency.init();
        requireDependency.getDependencies()
            .then(function(dependencies) {
                var lookup = {};

                expect(dependencies.length).to.equal(4);

                var requires = [];

                dependencies.forEach(function(d) {
                    if (d.type === 'require') {
                        requires.push(d);
                    }
                    else {
                        lookup[d.type] = d;    
                    }
                    
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, '../../client/optimizer.json'),
                });

                expect(lookup['commonjs-def']).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/bar@2.0.0/lib/index',
                    _file: nodePath.join(__dirname, 'test-project/node_modules/bar/lib/index.js')
                });

                expect(lookup['commonjs-def']).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/bar@2.0.0/lib/index',
                    _file: nodePath.join(__dirname, 'test-project/node_modules/bar/lib/index.js')
                });

                expect(requires.length).to.equal(1);

                expect(requires).to.deep.equal([{
                        type: 'require',
                        path: 'baz',
                        from: nodePath.join(__dirname, 'test-project/node_modules/bar/lib')
                    }]);

                done();
            })
            .fail(done);
    });

    it('should resolve to the correct optimizer manifest for a "require" dependency that resolves to a nested installed module', function(done) {

        var requireDependency = require('../lib/Dependency_require');
        requireDependency.path = "baz";
        requireDependency.from = nodePath.join(__dirname, 'test-project/node_modules/bar');
        requireDependency.init();

        requireDependency.getDependencies()
            .then(function(dependencies) {
                var lookup = {};

                expect(dependencies.length).to.equal(4);

                dependencies.forEach(function(d) {
                    lookup[d.type] = d;
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, '../../client/optimizer.json'),
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
            })
            .fail(done);

    });

    it('should resolve to the correct optimizer manifest for a "require" dependency with a resolved path and a non-string require in code', function(done) {

        var requireDependency = require('../lib/Dependency_require');
        requireDependency.resolvedPath = nodePath.join(__dirname, 'test-project/node_modules/foo/lib/index.js');
        requireDependency.init();
        requireDependency.getDependencies()
            .then(function(dependencies) {
                var lookup = {};

                expect(dependencies.length).to.equal(3);

                var requires = [];

                dependencies.forEach(function(d) {
                    if (d.type === 'require') {
                        requires.push(d);
                    }
                    else {
                        lookup[d.type] = d;    
                    }
                    
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, '../../client/optimizer.json'),
                });

                expect(lookup['commonjs-def']).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/foo@1.0.0/lib/index',
                    _file: nodePath.join(__dirname, 'test-project/node_modules/foo/lib/index.js')
                });

                expect(lookup['commonjs-def']).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/foo@1.0.0/lib/index',
                    _file: nodePath.join(__dirname, 'test-project/node_modules/foo/lib/index.js')
                });

                expect(requires.length).to.equal(0);

                done();
            })
            .fail(done);
    });

    it('should resolve to the correct optimizer manifest for a "require" dependency that has a browser module override', function(done) {
        var requireDependency = require('../lib/Dependency_require');
        requireDependency.path = "hello-world";
        requireDependency.from = nodePath.join(__dirname, 'test-project/browser-overrides/main');
        requireDependency.init();

        requireDependency.getDependencies()
            .then(function(dependencies) {
                var lookup = {};

                expect(dependencies.length).to.equal(4);

                dependencies.forEach(function(d) {
                    lookup[d.type] = d;
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, '../../client/optimizer.json'),
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
            })
            .fail(done);
    });

    it('should resolve to the correct optimizer manifest for a "require" dependency that has a browser file override', function(done) {
        var requireDependency = require('../lib/Dependency_require');
        requireDependency.path = "./browser-overrides/main/index";
        requireDependency.from = nodePath.join(__dirname, 'test-project');
        requireDependency.init();

        requireDependency.getDependencies()
            .then(function(dependencies) {
                var lookup = {};

                // console.log('DEPENDENCIES: ', dependencies);

                expect(dependencies.length).to.equal(3);

                dependencies.forEach(function(d) {
                    lookup[d.type] = d;
                });

                expect(lookup['package']).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, '../../client/optimizer.json'),
                });

                expect(lookup['commonjs-def']).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/browser-overrides/main/browser/index_browser',
                    _file: nodePath.join(__dirname, 'test-project/browser-overrides/main/browser/index_browser.js')
                });

                expect(lookup['commonjs-remap']).to.deep.equal({
                    type: 'commonjs-remap',
                    from: '/browser-overrides/main/index',
                    to: 'browser/index_browser',
                    _sourceFile: nodePath.join(__dirname, 'test-project/browser-overrides/main/browser/index_browser.js')
                });

                done();
            })
            .fail(done);
    });

    it('should resolve to the correct optimizer manifest for a "require" dependency that has an associated -optimizer.json', function(done) {
        var requireDependency = require('../lib/Dependency_require');
        requireDependency.path = "./src/with-package/foo/index";
        requireDependency.from = nodePath.join(__dirname, 'test-project');
        requireDependency.init();

        requireDependency.getDependencies()
            .then(function(dependencies) {
                var lookup = {};

                expect(dependencies.length).to.equal(3);
                var pkgs = [];

                dependencies.forEach(function(d) {
                    if (d.type === 'package') {
                        pkgs.push(d);
                    }
                    else {
                        lookup[d.type] = d;    
                    }
                    
                });

                expect(pkgs[0]).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, '../../client/optimizer.json'),
                });

                expect(pkgs[1]).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, 'test-project/src/with-package/foo/optimizer.json')
                });

                expect(lookup['commonjs-def']).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/src/with-package/foo/index',
                    _file: nodePath.join(__dirname, 'test-project/src/with-package/foo/index.js')
                });

                done();
            })
            .fail(done);
    });

    it('should resolve to the correct optimizer manifest for a "require" dependency that has an associated optimizer.json in dir', function(done) {
        var requireDependency = require('../lib/Dependency_require');
        requireDependency.path = "./src/with-package/bar/index";
        requireDependency.from = nodePath.join(__dirname, 'test-project');
        requireDependency.init();

        requireDependency.getDependencies()
            .then(function(dependencies) {
                var lookup = {};

                expect(dependencies.length).to.equal(3);

                var pkgs = [];

                dependencies.forEach(function(d) {
                    if (d.type === 'package') {
                        pkgs.push(d);
                    }
                    else {
                        lookup[d.type] = d;    
                    }
                    
                });

                expect(pkgs[0]).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, '../../client/optimizer.json'),
                });

                expect(pkgs[1]).to.deep.equal({
                    type: 'package',
                    path: nodePath.join(__dirname, 'test-project/src/with-package/bar/index-optimizer.json')
                });

                expect(lookup['commonjs-def']).to.deep.equal({
                    type: 'commonjs-def',
                    path: '/src/with-package/bar/index',
                    _file: nodePath.join(__dirname, 'test-project/src/with-package/bar/index.js')
                });

                done();
            })
            .fail(done);
    });

    

});

