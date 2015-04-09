'use strict';
require('../'); // Load the module
var nodePath = require('path');
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var MockLassoContext = require('./MockLassoContext');

require('../'); // Load this module just to make sure it works


describe('lasso-require/dependency-run' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }
        done();
    });

    it('should generate the correct code to run a module and not wait', function(done) {

        var runDependency = require('../lib/dependency-run');
        runDependency.path = '/';
        runDependency._file = nodePath.join(__dirname, 'test-project/node_modules/foo/lib/index.js');
        runDependency.wait = false;

        var code = '';
        runDependency.read(new MockLassoContext())
            .on('data', function(data) {
                code += data;
            })
            .on('end', function() {
                expect(code).to.equal('$rmod.run("/",{"wait":false});');
                done();
            })
            .on('error', done)
            .resume();
    });

    it('should generate the correct code to run a module and wait', function(done) {

        var runDependency = require('../lib/dependency-run');
        runDependency.path = '/';
        runDependency._file = nodePath.join(__dirname, 'test-project/node_modules/foo/lib/index.js');
        runDependency.wait = true;

        var code = '';
        runDependency.read(new MockLassoContext())
            .on('data', function(data) {
                code += data;
            })
            .on('end', function() {
                expect(code).to.equal('$rmod.run("/");');
                done();
            })
            .on('error', done)
            .resume();
    });


});

