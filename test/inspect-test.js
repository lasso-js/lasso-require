'use strict';


var nodePath = require('path');
var chai = require('chai');
chai.config.includeStack = true;
var fs = require('fs');
var inspect = require('../src/util/inspect');

describe('lasso-require/util/inspect' , function() {
    require('./autotest').scanDir(
        nodePath.join(__dirname, 'fixtures/inspect/autotest'),
        function (dir, done) {

            var inputPath = nodePath.join(dir, 'input.js');
            var inputSrc = fs.readFileSync(inputPath, { encoding: 'utf8' });
            var inspected = inspect(inputSrc);
            return done(null, inspected);
        },
        {
            ext: '.json'
        });

});