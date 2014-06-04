var transport = require('raptor-modules/transport');

module.exports = {
    properties: {
        'path': 'string',
        'paths': 'string[]'
    },

    init: function() {
        if (!this.paths) {
            this.paths = [];
        }

        if (this.path) {
            this.paths.push(this.path);
        }
    },

    getDir: function() {
        return null;
    },
    
    read: function(context) {
        return transport.addSearchPathsCode(this.paths);
    },

    lastModified: function() {
        return -1;
    }
};