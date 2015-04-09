'use strict';
require('../'); // Load the module
var nodePath = require('path');
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var fs = require('fs');

require('../'); // Load this module just to make sure it works

function createUniqueIdFunc() {
    var nextId = 0;
    return function uniqueId() {
        return nextId++;
    };
}

xdescribe('lasso-require/inspect' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }
        done();
    });

    it('should return the correct results for code with async dependencies', function() {
        var inspectModule = require('../lib/inspect');
        var src = fs.readFileSync(nodePath.join(__dirname, 'resources/inspect/simple.js'), {encoding: 'utf8'});
        var result = inspectModule.inspectSource(src, createUniqueIdFunc());
        // console.log(JSON.stringify(result, null, 4));
        // console.log('RESULT CODE:\n' + result.code);
        // console.log('RESULT:', JSON.stringify(result, null, '   '));
        expect(result).to.deep.equal(require('./resources/inspect/simple.expected.json'));

    });

    it('should return the correct results for code when using var reference to raptor-loader', function() {
        var inspectModule = require('../lib/inspect');
        var src = fs.readFileSync(nodePath.join(__dirname, 'resources/inspect/raptor-loader-var.js'), {encoding: 'utf8'});
        var result = inspectModule.inspectSource(src, createUniqueIdFunc());
        // console.log(JSON.stringify(result, null, 4));
        // console.log('RESULT CODE:\n' + result.code);
        // console.log('RESULT:', JSON.stringify(result, null, '   '));
        expect(result).to.deep.equal(require('./resources/inspect/raptor-loader-var.expected.json'));
    });

    it('should detect process correctly (1)', function() {
        var inspectModule = require('../lib/inspect');
        var src = fs.readFileSync(nodePath.join(__dirname, 'resources/inspect/process1.js'), {encoding: 'utf8'});
        var result = inspectModule.inspectSource(src, createUniqueIdFunc());
        expect(result.processGlobal).to.equal(true);
    });

    it('should detect process correctly (2)', function() {
        var inspectModule = require('../lib/inspect');
        var src = fs.readFileSync(nodePath.join(__dirname, 'resources/inspect/process2.js'), {encoding: 'utf8'});
        var result = inspectModule.inspectSource(src, createUniqueIdFunc());
        expect(result.processGlobal).to.equal(true);
    });

    it('should detect process correctly (3)', function() {
        var inspectModule = require('../lib/inspect');
        var src = fs.readFileSync(nodePath.join(__dirname, 'resources/inspect/process3.js'), {encoding: 'utf8'});
        var result = inspectModule.inspectSource(src, createUniqueIdFunc());
        expect(result.processGlobal).to.equal(false);
    });

    it('should detect process correctly (4)', function() {
        var inspectModule = require('../lib/inspect');
        var src = fs.readFileSync(nodePath.join(__dirname, 'resources/inspect/process4.js'), {encoding: 'utf8'});
        var result = inspectModule.inspectSource(src, createUniqueIdFunc());
        expect(result.processGlobal).to.equal(true);
    });


});
