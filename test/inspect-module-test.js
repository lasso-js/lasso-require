'use strict';
require('../'); // Load the module
var nodePath = require('path');
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var fs = require('fs');

require('../'); // Load this module just to make sure it works

describe.only('raptor-optimizer-require/inspect-module' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }
        done();
    });

    it('should return the correct results for code with async dependencies', function() {
        var inspectModule = require('../lib/inspect-module');
        var src = fs.readFileSync(nodePath.join(__dirname, 'resources/inspect/simple.js'), {encoding: 'utf8'});
        var result = inspectModule(src);
        console.log('RESULT CODE:\n' + result.code);
        console.log('RESULT:', JSON.stringify(result, null, '   '));
    });
    

});

