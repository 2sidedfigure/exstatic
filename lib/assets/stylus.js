"use strict";

var util = require('util'),
    stylus = require('stylus'),
    nib = require('nib'),

    Asset = require('../Asset'),
    StylusAsset = function(settings) {
        settings.compressor = settings.compressor || 'none';

        this.init(settings);

        var self = this;

        this.on('variantRenderFile', function(variant, file, cb) {
            stylus(variant.getRenderCache(file))
                .use(nib())
                .set('filename', file)
                .set('linenos', !Asset.COMPRESS)
                .set('compress', Asset.COMPRESS)
                .define('staticAsset', function(assetId) {
                    return self.manager.getAssetUrl(assetId.val);
                })
                .render(function(err, css) {
                    if (err) {
                        console.error("ERROR: Unable to render " + file + " using stylus!");
                        console.error(err);
                        variant.setRenderCache(file, '/* Error */');
                        return cb(err);
                    }

                    variant.setRenderCache(file, css);

                    return cb();
                });
        });
    };

util.inherits(StylusAsset, Asset);

StylusAsset.configure = function(opts) {
    Asset.configure(opts);
};

module.exports = StylusAsset;
