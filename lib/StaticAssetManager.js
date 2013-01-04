"use strict";

var _ = require('underscore'),
    exec = require('child_process').exec,
    path = require('path');

var StaticAssetManager = function(settings, opts) {
    // memory storage for asset types and assets
    // in future versions, provide the options to offload asset storage to redis or mongo
    this.assets = {};
    this.types = {};

    // try and set some sane defaults if none are set
    this.settings = _.extend({
        cachePath: __dirname + '/static_cache',
        version: Math.round(+new Date()/1000)
    }, settings);

    this.options = opts || {};

    // make sure these methods are executed with the proper context
    _.bindAll(this,
            'middleware',
            'cleanup'
            );

    // cleanup the cache directory unless told otherwise
    this.options.noCleanup || this.bindCleanup(true);
};

_.extend(StaticAssetManager.prototype, {
    createAsset: function(type, opts) {
        var t = this.checkAssetType(type);

        if (t) {
            var asset = new t(opts);
            this.assets[asset.uri] = asset;

            console.log('Serving static asset from ' + asset.uri);

            if (this.prerender) {
                asset.fetchCachedPath();
            }

            return asset;
        } else {
            console.warn("WARNING: Can't create an asset of type " + type);
            return false;
        }
    },
    checkAssetType: function(type) {
        if (this.types[type]) {
            return this.types[type];
        }

        var suffix = 'StaticAsset',
            fullPath = __dirname + '/' + type + suffix;

        if (path.existsSync(fullPath + '.js')) {
            this.types[type] = require(fullPath)(this.settings);
            return this.types[type];
        } else {
            return false;
        }
    },
    middleware: function(req, res, next) {
        var asset = this.assets[req.url];

        if (asset) {
            return asset.fetchCachedPath(function(err, path) {
                return res.set({
                    'Cache-Control': '600',
                    //Expires
                    // TODO: make the cache headers configurable
                }).sendfile(path);
            });
        }

        next();
    },
    bindCleanup: function(bind) {
        var method = bind ? 'on' : 'removeListener',
            events = [
                'exit',
                'SIGINT'
            ];

        _.each(events, function(e) {
            process[method](e, this.cleanup);
        }, this);
    },
    cleanup: function() {
        console.log('\nDeleting the static cache folder...');
        var self = this;

        exec('rm -r ' + this.settings.cachePath, function(err, stdout, stderr) {
            var errMsg = 'ERROR: Unable to properly cleanup static cache!',
                allowed = /no such file or directory/i;

            if (!_.isEmpty(stderr) && !allowed.test(stderr)) {
                console.error(errMsg);
                console.error(stderr);
            }

            self.bindCleanup(false);

            console.log('done.');
            process.exit();
        });
    }
});

module.exports = function(opts) {
    return new StaticAssetManager(opts);
};
