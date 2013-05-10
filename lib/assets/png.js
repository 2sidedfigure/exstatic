"use strict";

var util = require('util'),
    fs = require('fs'),
    _ = require('underscore'),
    optipng = require('optipng'),

    Asset = require('../Asset'),
    PNGAsset = function(settings) {
        if (settings.files && settings.files.length > 1) {
            throw new Error("A PNG Asset can't be more than one file!");
        }

        this.init(_.extend({
            compressor: 'optipng'
        }, settings));

        var self = this;

        this.on('variantRenderFile', function(variant, file, cb) {
            if (!Asset.COMPRESS) return cb();

            self.compress(file, variant.getRenderCache(file), function(err, data) {
                variant.setRenderCache(file, data);
                cb();
            });
        });
    };

util.inherits(PNGAsset, Asset);

Asset.registerCompressor('optipng', function(filepath, data, cb) {
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

PNGAsset.configure = function(opts) {
    Asset.configure(opts);
};

module.exports = PNGAsset;
