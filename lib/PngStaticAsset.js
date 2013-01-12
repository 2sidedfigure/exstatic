"use strict";

var util = require('util'),
    fs = require('fs'),
    _ = require('underscore'),
    optipng = require('optipng'),

    StaticAsset = require('./StaticAsset')(),
    PNGStaticAsset = function(settings) {
        this.init(_.extend({
            compressor: 'optipng',
            binary: true
        }, settings));
    };

StaticAsset.registerCompressor('optipng', function(filepath, data, cb) {
    var buffer = new Buffer(0),
        compressor = new optipng(['-o5']);

    compressor.on('data', function(chunk) {
        var len = buffer.length + chunk.length,
            b = new Buffer(len);

        b.write(buffer.toString('binary'), 0, buffer.length, 'binary');
        b.write(chunk.toString('binary'), buffer.length, len, 'binary');

        buffer = b;
    });

    compressor.on('end', function() {
        cb(null, buffer);
    });

    compressor.on('error', function(err) {
        console.error('ERROR: Unable to compress ' + filepath + ' with optipng!');
        console.error(err);

        // just return the original file contents
        cb(null, data);
    });

    fs.createReadStream(filepath).pipe(compressor);
});

PNGStaticAsset.configure = function(opts) {
    StaticAsset.configure(opts);
};

util.inherits(PNGStaticAsset, StaticAsset);

module.exports = function(opts) {
    StaticAsset.configure(opts);

    return PNGStaticAsset;
};
