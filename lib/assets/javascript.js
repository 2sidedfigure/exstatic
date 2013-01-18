"use strict";

var util = require('util'),
    jsParser = require('uglify-js').parser,
    compressor = require('uglify-js').uglify,

    Asset = require('../Asset')(),
    JSAsset = function(settings) {
        settings.compressor = settings.compressor || 'uglify';

        this.init(settings);
    };

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

util.inherits(JSAsset, Asset);

module.exports = function(opts) {
    Asset.configure(opts);

    return JSAsset;
}
