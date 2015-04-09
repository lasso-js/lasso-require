'use strict';
require('../'); // Load the module
var nodePath = require('path');
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var fs = require('fs');

require('../'); // Load this module just to make sure it works

describe('lasso-require/dependency-remap' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }
        done();
    });

    it('should generate the correct remap code', function(done) {

        var defDependency = require('../lib/dependency-remap');
        defDependency.from = "/foo@1.0.0/lib/index";
        defDependency.to = "browser/index";
        var code = '';
        defDependency.read()
            .on('data', function(data) {
                code += data;
            })
            .on('end', function() {
                expect(code).to.equal('$rmod.remap("/foo@1.0.0/lib/index", "browser/index");');
                done();
            })
            .on('error', done)
            .resume();
    });


});

