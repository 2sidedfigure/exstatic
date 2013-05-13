"use strict";

var
_ = require('underscore'),
exec = require('child_process').exec,
mmm, magic,

fileIsBinary = function(file, cb) {
    if (magic && magic.detectFile) {
        magic.detectFile(file, function(err, encoding) {
            cb(null, encoding == 'binary');
        });
    } else {
        //falling back to the BSD file command.
        //sorry windows users, make mmmagic work or submit a patch
        exec('file -bi ' + file, function(err, stdout, stderr) {
            cb(err || stderr, stdout.indexOf('text') == -1);
        });
    }
},

lcFirst = function(str) {
    var arr = str.split('');

    arr[0] = arr[0].toLowerCase();

    return arr.join('');
},

setupGetters = function(obj) {
    var funcs = _.functions(obj),
        getters = _.filter(funcs, function(f) { return /^_get\w+/.test(f); }),
        removeRE = /^_get/;

    _.each(getters, function(f) {
        var name = lcFirst(f.replace(removeRE, ''));
        obj.__defineGetter__(name, obj[f]);
    });
};

//try loading mmmagic
try {
    mmm = require('mmmagic');
    magic = new mmm.Magic(mmm.MAGIC_MIME_ENCODING);
} catch (ex) {
    mmm = magic = null;
}

module.exports = {
    lcFirst: lcFirst,
    setupGetters: setupGetters,
    fileIsBinary: fileIsBinary
};
