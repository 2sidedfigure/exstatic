"use strict";

var util = require('util'),
    stylus = require('stylus'),
    nib = require('nib'),

    StaticAsset = require('./StaticAsset')(),
    StylusStaticAsset = function(settings) {
        settings.compressor = settings.compressor || 'none';

        this.init(settings);
    };

StylusStaticAsset.configure = function(opts) {
    StaticAsset.configure(opts);
};

util.inherits(StylusStaticAsset, StaticAsset);

StylusStaticAsset.prototype.preprocess = function(filepath, data, cb) {
    var self = this;

    stylus(data)
        .use(nib())
        .set('filename', filepath)
        .set('linenos', !StaticAsset.COMPRESS)
        .set('compress', StaticAsset.COMPRESS)
        .define('staticAsset', function(assetId) {
            return self.manager.assetIds[assetId.val];
        })
        .render(function(err, css) {
            if (err) {
                console.error("ERROR: Unable to render " + filepath + " using stylus!");
                console.error(err);
                return cb(err);
            }

            return cb(null, css);
        });
};

module.exports = function(opts) {
    StaticAsset.configure(opts);

    return StylusStaticAsset;
}

