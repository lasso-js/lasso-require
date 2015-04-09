'use strict';
require('../'); // Load the module
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;

require('../'); // Load this module just to make sure it works

describe('lasso-require/dependency-main' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }
        done();
    });

    it('should generate the correct main for an installed module', function(done) {

        var defDependency = require('../lib/dependency-main');
        defDependency.dir = '/foo@1.0.0';
        defDependency.main = 'lib/index';
        var code = '';
        defDependency.read()
            .on('data', function(data) {
                code += data;
            })
            .on('end', function() {
                expect(code).to.equal('$rmod.main("/foo@1.0.0", "lib/index");');
                done();
            })
            .on('error', done)
            .resume();
    });


});

