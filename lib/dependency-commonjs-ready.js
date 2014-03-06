var transport = require('raptor-modules/transport');

module.exports = {
    properties: {
    },
    
    read: function(context) {
        return transport.readyCode();
    },

    lastModified: function() {
        return 0;
    }
};