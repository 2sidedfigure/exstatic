"use strict";

var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    _ = require('underscore'),
    stylus = require('stylus'),
    nib = require('nib'),

    Asset = require('../Asset'),
    StylusAsset = function(settings) {
        settings.compressor = settings.compressor || 'none';

        this.init(settings);

        var self = this;

        this.on('variantInit', function(variant, cb) {
            variant.imports = [].concat(self.settings.imports || []);
            variant.defines = _.extend({}, self.settings.defines);

            cb();
        });

        this.on('variantRenderFile', function(variant, file, cb) {
            var content = variant.getRenderCache(file);

            self.tryRender(variant, file, content, function(err, css) {
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

StylusAsset.prototype.tryRender = function(variant, file, content, cb) {
    var self = this,
        absFileDir = path.dirname(fs.realpathSync(file)),
        styl = stylus(content)
            .use(nib())
            .set('filename', file)
            .set('linenos', !Asset.COMPRESS)
            .set('compress', Asset.COMPRESS)
            .define('staticAsset', function(assetId) {
                return self.manager.getAssetUrl(assetId.val, variant.params);
            });

    variant.imports.forEach(function(i) {
        var iPath = path.relative(absFileDir, fs.realpathSync(i));

        if (!/\.(css|styl)$/i.test(path.extname(iPath))) {
            console.warn('WARNING: Not importing ' + i + ' into stylus file ' + file + '; file extension must be .css or .styl!');
            return;
        }

        iPath = iPath.replace(/\.styl$/i, '');

        styl = styl.import(iPath);
    });

    _.each(variant.defines, function(v, k) {
        styl = styl.define(k, v);
    });

    styl.render(function(err, css) {
        if (err && /\.css$/i.test(file)) {
            return self.tryRender(variant, file, "@css {\n" + content + "\n}", cb);
        }

        cb(err, css);
    });
};

StylusAsset.configure = function(opts) {
    Asset.configure(opts);
};

StylusAsset.stylus = stylus;

module.exports = StylusAsset;
