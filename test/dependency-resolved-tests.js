'use strict';
require('../'); // Load the module
var nodePath = require('path');
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var fs = require('fs');

require('../'); // Load this module just to make sure it works

describe('lasso-require/dependency-resolved' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }
        done();
    });

    it('should generate the correct main for an installed module', function(done) {

        var resolvedDependency = require('../lib/dependency-resolved');
        resolvedDependency.target = "baz";
        resolvedDependency.from = "/src";
        resolvedDependency.resolved = "/$/baz/lib/index";
        var code = '';
        resolvedDependency.read()
            .on('data', function(data) {
                code += data;
            })
            .on('end', function() {
                expect(code).to.equal('$rmod.resolved("baz", "/src", "/$/baz/lib/index");');
                done();
            })
            .on('error', done)
            .resume();
    });


});

