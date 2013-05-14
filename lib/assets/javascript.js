"use strict";

var util = require('util'),
    path = require('path'),
    jsParser = require('uglify-js').parser,
    compressor = require('uglify-js').uglify,

    Asset = require('../Asset'),
    JSAsset = function(settings) {
        settings.compressor = settings.compressor || 'uglify';

        this.init(settings);

        var self = this;

        this.on('variantPostRenderFile', function(variant, file, cb) {
            var basename = path.basename(file),
                contents = variant.getRenderCache(file);

            if (!Asset.COMPRESS) {
                variant.setRenderCache(file, contents + "\n\n");
                return cb();
            }

            self.compress(file, contents, function(err, data) {
                // errors are already signaled by the compressor
                variant.setRenderCache(file, "/* " + basename + " */\n" + data + "\n\n");
                cb();
            });
        });
    };

util.inherits(JSAsset, Asset);

Asset.registerCompressor('uglify', function(filepath, data, cb) {
    try {
        var ast = compressor.ast_squeeze(compressor.ast_mangle(jsParser.parse(data)));
        cb(null, ';' + compressor.gen_code(ast));
    } catch (ex) {
        console.error('ERROR: Uglify compressor error in ' + filepath);
        console.error(ex);

        // only show the error in the logs...don't stop serving because of this
        cb(null, data);
    }
});

JSAsset.configure = function(opts) {
    Asset.configure(opts);
};

module.exports = JSAsset;
