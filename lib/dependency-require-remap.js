var nodePath = require('path');
var extend = require('raptor-util/extend');

function create(config, lasso) {
    config = config || {};
    var resolver = config.resolver;

    return {
        properties: {
            from: 'string',
            to: 'string',
            fromDirname: 'string'
        },

        init: function(lassoContext, callback) {
            var fromDirname = this.fromDirname || this.getParentManifestDir();
            var fromPath = this.resolvePath(this.from);
            var toPath = this.resolvePath(this.to);

            this.from = fromPath;
            this.to = toPath;

            var remap = {};
            remap[fromPath] = toPath;

            var options = {
                remap: remap
            };

            var _this = this;

            resolver.resolveRequire(fromPath, fromDirname, fromPath, options, lassoContext, function(err, resolved) {
                if (err) {
                    return callback(err);
                }

                _this._resolved = resolved;
                callback();
            });
        },

        getDir: function() {
            return nodePath.dirname(this.to);
        },

        getDependencies: function(lassoContext, callback) {
            var resolved = this._resolved;
            var remap = resolved.remap;
            var dependencies;

            if (remap) {
                var dep = extend({
                    type: 'commonjs-remap',
                    _sourceFile: resolved.filePath,
                }, remap);

                dependencies = [dep];

            } else {
                dependencies = [];
            }

            callback(null, dependencies);
        }
    };
}

exports.create = create;
