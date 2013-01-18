"use strict";

var util = require('util'),
    stylus = require('stylus'),
    nib = require('nib'),

    Asset = require('../Asset')(),
    StylusAsset = function(settings) {
        settings.compressor = settings.compressor || 'none';

        this.init(settings);
    };

StylusAsset.configure = function(opts) {
    Asset.configure(opts);
};

util.inherits(StylusAsset, Asset);

StylusAsset.prototype.preprocess = function(filepath, data, cb) {
    var self = this;

    stylus(data)
        .use(nib())
        .set('filename', filepath)
        .set('linenos', !Asset.COMPRESS)
        .set('compress', Asset.COMPRESS)
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
    Asset.configure(opts);

    return StylusAsset;
}

