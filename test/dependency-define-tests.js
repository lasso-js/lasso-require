'use strict';
require('../'); // Load the module
var nodePath = require('path');
var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();
var expect = require('chai').expect;

require('../'); // Load this module just to make sure it works

var MockLassoContext = require('./MockLassoContext');

xdescribe('lasso-require/dependency-define' , function() {

    beforeEach(function(done) {
        for (var k in require.cache) {
            if (require.cache.hasOwnProperty(k)) {
                delete require.cache[k];
            }
        }

        // require('raptor-logging').configureLoggers({
        //     'lasso-require': 'DEBUG'
        // });
        done();
    });

    it('should generate the correct code for an installed module', function(done) {

        var defDependency = require('../lib/dependency-define');
        defDependency.path = '/foo@1.0.0/lib/index';
        defDependency._file = nodePath.join(__dirname, 'test-project/node_modules/foo/lib/index.js');
        defDependency._requireReader = function() {
            return require('fs').createReadStream(defDependency._file, {encoding: 'utf8'});
        };

        var code = '';
        defDependency.read(new MockLassoContext())
            .on('data', function(data) {
                code += data;
            })
            .on('end', function() {
                expect(code).to.equal('$rmod.def("/foo@1.0.0/lib/index", function(require, exports, module, __filename, __dirname) { exports.foo = "1.0.0";\nvar target = "baz";\nrequire(target);\n});');
                done();
            })
            .on('error', done)
            .resume();
    });


});
