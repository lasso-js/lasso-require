'use strict';
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var nodePath = require('path');
var fs = require('fs');

require('app-module-path').addPath(nodePath.join(__dirname, 'src'));

var plugins = {};
plugins[nodePath.join(__dirname, '../lib/raptor-optimizer-require')] = {};

describe('raptor-optimizer' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }

        require('raptor-promises').enableLongStacks();

        require('raptor-logging').configureLoggers({
            'raptor-optimizer': 'WARN'
        });

        done();
    });

    it('should handle require for modules with dependencies', function(done) {
        var writer = require('./MockWriter').create({
            outputDir: 'build',
            checksumsEnabled: false
        });
        var optimizer = require('raptor-optimizer');

        require('../lib/raptor-optimizer-require').INCLUDE_CLIENT = false;

        optimizer.create({
                enabledExtensions: ['jquery', 'browser'],
                plugins: plugins
            }, __dirname, __filename)
            .then(function(pageOptimizer) {
                return pageOptimizer.optimizePage({
                        pageName: "testPage",
                        writer: writer,
                        dependencies: [
                            { "require": "foo" },
                            { "require": "bar" }],
                        from: nodePath.join(__dirname, 'test-project/index.js')
                    });
            })
            .then(function(optimizedPage) {
                // console.log('writer: ', writer);
                expect(writer.getOutputPaths()).to.deep.equal([
                        nodePath.join(__dirname, 'build/testPage.js')
                    ]);

                // console.log(writer.getCodeForFilename('testPage.js'));

                var actual = writer.getCodeForFilename('testPage.js');
                fs.writeFileSync(nodePath.join(__dirname, 'resources/foo-bar-bundle.actual.js'), actual, {encoding: 'utf8'});
                expect(actual).to.equal(
                    fs.readFileSync(nodePath.join(__dirname, 'resources/foo-bar-bundle.js'), {encoding: 'utf8'}));
            })
            .then(done)
            .fail(done);
    });

    it('should bundle require dependencies correctly', function(done) {
        var writer = require('./MockWriter').create({
            outputDir: 'build',
            checksumsEnabled: false
        });
        var optimizer = require('raptor-optimizer');

        optimizer.create({
                enabledExtensions: ['jquery', 'browser'],
                plugins: plugins,
                bundles: [
                    {
                        name: 'core',
                        dependencies: [
                            'raptor-modules/client'
                        ]
                    },
                    {
                        name: 'jquery',
                        dependencies: [
                            'require jquery'
                        ]
                    }
                ]
            }, nodePath.join(__dirname, 'test-project'))
            .then(function(pageOptimizer) {
                return pageOptimizer.optimizePage({
                        pageName: "testPage",
                        writer: writer,
                        dependencies: [
                            "require jquery",
                            "require foo"
                        ],
                        from: nodePath.join(__dirname, 'test-project')
                    });
            })
            .then(function(optimizedPage) {
                expect(writer.getOutputPaths()).to.deep.equal([
                        nodePath.join(__dirname, 'build/core.js'),
                        nodePath.join(__dirname, 'build/jquery.js'),
                        nodePath.join(__dirname, 'build/testPage.js')
                    ]);
            })
            .then(done)
            .fail(done);
    });
});

