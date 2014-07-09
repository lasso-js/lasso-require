var transport = require('raptor-modules/transport');

module.exports = {
    properties: {
    },

    getDir: function() {
        return null;
    },
    
    read: function(context) {
        return transport.readyCode();
    },

    calculateKey: function() {
        return '$commonjs-ready';
    },

    lastModified: function() {
        return -1;
    }
};