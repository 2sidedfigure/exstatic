"use strict";

var util = require('util'),
    jsParser = require('uglify-js').parser,
    compressor = require('uglify-js').uglify,

    StaticAsset = require('./StaticAsset')(),
    JSStaticAsset = function(settings) {
        settings.compressor = settings.compressor || 'uglify';

        this.init(settings);
    };

StaticAsset.registerCompressor('uglify', function(data, cb) {
    try {
        var ast = compressor.ast_squeeze(compressor.ast_mangle(jsParser.parse(data)));
        cb(null, ';' + compressor.gen_code(ast));
    } catch (ex) {
        console.error('ERROR: Uglify compressor error.');
        console.error(ex);

        // only show the error in the logs...don't stop serving because of this
        cb(null, data);
    }
});

JSStaticAsset.configure = function(opts) {
    StaticAsset.configure(opts);
};

util.inherits(JSStaticAsset, StaticAsset);

module.exports = function(opts) {
    StaticAsset.configure(opts);

    return JSStaticAsset;
}
