"use strict";

var _ = require('underscore'),
    exec = require('child_process').exec,
    path = require('path'),
    fs = require('fs');

// utilities
var formatSingleAssetPattern = function(pattern, filePath) {
    var ext = path.extname(filePath);

    return pattern.replace(/\:path/g, filePath)
                    .replace(/\:dirname/g, path.dirname(filePath))
                    .replace(/\:basename/g, path.basename(filePath, ext))
                    .replace(/\:extname/g, ext);
};

// mappings
var fileTypeMap = {
        'javascript': ['js'],
        'stylus': ['styl', 'stylus'],
        'png': ['png']
    };

var AssetManager = function(settings, opts) {
    // memory storage for asset types and assets
    // in future versions, provide the options to offload asset storage to redis or mongo
    this.assets = {};
    this.types = {};
    this.assetIdMap = {};

    // try and set some sane defaults if none are set
    this.settings = _.extend({
        host: '',
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

    this.__defineGetter__('assetIds', function() {
        var idMap = {};

        _.each(this.assetIdMap, function(v, k) {
            idMap[k] = this.settings.host + v;
        }, this);

        return idMap;
    });
};

_.extend(AssetManager.prototype, {
    getAssetUrl: function(key) {
        return this.settings.host + this.assetIdMap[key];
    },
    createAsset: function(type, settings) {
        var t = this.checkAssetType(type);

        if (!t) {
            console.warn("WARNING: Can't create an asset of type " + type + "!");
            return false;
        }

        _.extend(settings, {
            manager: this
        });

        var asset = new t(settings),
            checks = [
                {
                    check: !!this.assetIdMap[asset.id],
                    msg: "WARNING: There is already an asset using the id '" + asset.id + "'!"
                },
                {
                    check: !!this.assets[asset.uri],
                    msg: "WARNING: There is already an asset using the path '" + asset.uri + "'!"
                }
            ],
            failedChecks = false;

        _.each(checks, function(c) {
            if (c.check) {
                console.warn(c.msg);
                failedChecks = true;
            }
        });

        if (failedChecks) {
            return false;
        }

        this.assets[asset.uri] = asset;
        this.assetIdMap[asset.id] = asset.uri;

        console.log("Serving static asset '" + asset.id + "' from " + asset.uri);

        return asset;
    },
    createAssetsFromDirectory: function(pattern, dir) {
        var ignoreREs = [
            /^\./,
            /\.sw[o|p]$/,
            /~$/,
            /\.bak$/
        ];

        if (_.isArray(dir)) {
            _.each(dir, function(d) {
                this.createAssetsFromDirectory(pattern, d);
            }, this);

            return;
        }

        _.each(fs.readdirSync(dir), function(file) {
            //ignore files matching defined patterns
            if (_.some(ignoreREs, function(re) { return re.test(file); })) {
                return;
            }

            var filePath = path.join(dir, file),
                stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                //recurse!
                this.createAssetsFromDirectory(pattern, filePath);
            } else if (stat.isFile()) {
                //create the asset
                var ext = path.extname(file).replace(/^./, ''),
                    assetType = 'none',
                    id = filePath.replace(/\.+\//g, ''),
                    settings = {
                        id: id,
                        pattern: formatSingleAssetPattern(pattern, id),
                        files: [
                            filePath
                        ]
                    };

                _.each(fileTypeMap, function(exts, type) {
                    _.contains(exts, ext) && (assetType = type);
                });

                this.createAsset(assetType, settings);
            }
        }, this);
    },
    checkAssetType: function(type) {
        if (this.types[type]) {
            return this.types[type];
        }

        var fullPath = type == 'none'
                        ? __dirname + '/Asset'
                        : __dirname + '/assets/' + type;

        if (path.existsSync(fullPath + '.js')) {
            this.types[type] = require(fullPath)(this.settings);
            return this.types[type];
        } else {
            return false;
        }
    },
    middleware: function(req, res, next) {
        var self = this,
            asset = this.assets[req.url];

        res.locals.staticAssets = function() {
            return function(id) {
                return self.getAssetUrl(id);
            };
        };

        if (asset) {
            return asset.fetchCachedPath(function(err, path) {
                return res
                    .set(asset.cacheHeaders)
                    .sendfile(path);
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
    return new AssetManager(opts);
};
