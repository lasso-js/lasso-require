function StringTransformer() {
    this.modifications = [];
}

StringTransformer.prototype = {
    transform: function(str) {
        this.modifications.sort(function(a, b) {
            return b.index - a.index;
        });

        for (var i=0,len=this.modifications.length; i<len; i++) {
            str = this.modifications[i].transform(str);
        }

        return str;
    },

    insert: function(index, newStr) {
        this.modifications.push({
            index: index,
            transform: function(str) {
                return str.substring(0, index) + newStr + str.substring(index);
            }
        });
    },

    replace: function(range, replacement) {
        this.modifications.push({
            index: range[0],
            transform: function(str) {
                return str.substring(0, range[0]) + replacement + str.substring(range[1]);
            }
        });
    },

    comment: function(range) {
        this.modifications.push({
            index: range[0],
            transform: function(str) {
                var code = str.substring(range[0], range[1]);
                return str.substring(0, range[0]) + '/*' + code + '*/' + str.substring(range[1]);
            }
        });
    }
};

module.exports = StringTransformer;