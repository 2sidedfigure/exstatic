"use strict";

var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    stylus = require('stylus'),
    nib = require('nib'),

    Asset = require('../Asset'),
    StylusAsset = function(settings) {
        settings.compressor = settings.compressor || 'none';

        this.init(settings);

        var self = this;

        this.on('variantRenderFile', function(variant, file, cb) {
            var absFileDir = path.dirname(fs.realpathSync(file)),
                imports = variant.imports || self.settings.imports,
                styl = stylus(variant.getRenderCache(file))
                    .use(nib())
                    .set('filename', file)
                    .set('linenos', !Asset.COMPRESS)
                    .set('compress', Asset.COMPRESS)
                    .define('staticAsset', function(assetId) {
                        return self.manager.getAssetUrl(assetId.val, variant.params);
                    });

            imports && imports.forEach(function(i) {
                var iPath = path.relative(absFileDir, fs.realpathSync(i));

                if (!/\.(css|styl)$/i.test(path.extname(iPath))) {
                    console.warn('WARNING: Not importing ' + i + ' into stylus file ' + file + '; file extension must be .css or .styl!');
                    return;
                }

                iPath = iPath.replace(/\.styl$/i, '');

                styl = styl.import(iPath);
            });

            styl.render(function(err, css) {
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
