"use strict";

var util = require('util'),
    StaticAsset = require('./StaticAsset')(),

    JSStaticAsset = function(settings) {
        settings.compressor = settings.compressor || 'js';

        this.init(settings);
    };

JSStaticAsset.configure = function(opts) {
    StaticAsset.configure(opts);
};

util.inherits(JSStaticAsset, StaticAsset);

module.exports = function(opts) {
    StaticAsset.configure(opts);

    return JSStaticAsset;
}
