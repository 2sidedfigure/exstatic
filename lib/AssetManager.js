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

var AssetManager = function(settings) {
    // memory storage for asset types and assets
    // in future versions, provide the options to offload asset storage to redis or mongo
    this.assets = {};
    this.types = {
        'none': require('./Asset')
    };

    // try and set some sane defaults if none are set
    this.settings = _.extend({
        host: '',
        cachePath: __dirname + '/static_cache',
        version: Math.round(+new Date()/1000)
    }, settings);

    // pass the configuration to the assets
    this.types['none'].configure(this.settings);

    //build up the search path for asset types
    this.settings.typeSearchPath = this.settings.typeSearchPath || [];
    if (!_.isArray(this.settings.typeSearchPath)) {
        this.settings.typeSearchPath = [ this.settings.typeSearchPath ]
    };
    this.settings.typeSearchPath.push(path.join(__dirname, 'assets'));

    // make sure these methods are executed with the proper context
    _.bindAll(this,
            'middleware',
            'cleanup'
            );

    // cleanup the cache directory unless told otherwise
    this.settings.noCleanup || this.bindCleanup(true);
};

_.extend(AssetManager.prototype, {
    Asset: require('./Asset'),
    getAssetUrl: function(key, params) {
        var asset = this.assets[key];

        if (!asset) {
            return null;
        }

        var port = this.settings.port,
            customPort = port && !_.contains(['80', '443'], port);

        return this.settings.host + (customPort ? ':' + port : '') + asset.getURI(params);
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

        var asset = new t(settings);

        this.assets[asset.id] = asset;

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

        var assetPaths = this.getAssetTypeSearchPath(type),
            requirePath = _.find(assetPaths, function(p) {
                return fs.existsSync(p + '.js');
            });

        if (requirePath) {
            this.types[type] = require(requirePath);
            return this.types[type];
        } else {
            return false;
        }
    },
    getAssetTypeParent: function(type) {
        var assetPaths = this.getAssetTypeSearchPath(type);

        assetPaths.shift();

        var requirePath = _.find(assetPaths, function(p) {
            return fs.existsSync(p + '.js');
        });

        return requirePath
            ? require(requirePath)
            : null;
    },
    getAssetTypeSearchPath: function(type) {
        var assetPaths = [];

        //build the asset search path
        _.each(this.settings.typeSearchPath, function(p) {
            assetPaths.push(path.join(p, type));
        });

        //always fall back to the generic type
        assetPaths.push(__dirname + '/Asset');

        return assetPaths;
    },
    middleware: function(req, res, next) {
        var self = this,
            asset = _.find(this.assets, function(a) { return a.matchesURL(req.url) });

        res.locals.staticAssets = function() {
            return function(id) {
                var params = asset
                        ? asset.getParamsFromURI(req.url)
                        : null,
                    staticParams = _.extend(
                        { version: self.settings.version },
                        res.locals.staticParams,
                        params
                    );

                return self.getAssetUrl(id, staticParams);
            };
        };

        if (asset) {
            if (asset.sendAsset(req.url, res)) {
                return;
            } else {
                return res.send(404);
            }
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

var instance,
    getInstance = function(settings) {
        if (!instance) {
            instance = new AssetManager(settings);
        }

        return instance;
    };

// include for easy inheritance for custom asset types
getInstance.Asset = require('./Asset');

module.exports = getInstance;
