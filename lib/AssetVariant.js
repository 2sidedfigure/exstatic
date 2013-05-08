"use strict";

var
    _ = require('underscore'),
    async = require('async'),
    crypto = require('crypto'),
    fs = require('fs'),
    path = require('path'),
    moment = require('moment'),
    async = require('async'),
    utils = require('./utils'),
    Asset,

    eventHandler = function(variant, eventName) {
        return function(cb) {
            var count = 0,
                listenerCount = (variant.asset.listeners(eventName) || []).length,
                listenerCb = function(err) {
                    if (err) {
                        console.error("Error during the " + eventName);
                        console.error(err);
                        return cb(err);
                    }

                    if (count >= listenerCount) cb();
                    count++;
                };

            if (listenerCount) {
                variant.asset.emit(eventName, variant, listenerCb);
            } else {
                cb();
            }
        };
    },

// should be able to create an asset variant
//   1. knowing the full path, and parsing the settings from the URL
//   2. knowing the settings, building the path and asset
AssetVariant = function(settings, asset) {
    settings = settings || {};

    utils.setupGetters(this);
    Asset = Asset || asset.constructor.super_;

    this.asset = asset;
    this.files = [].concat(asset.files);
    this.params = _.omit(settings.params || {}, 'cacheId');
    this.isBinary = null;

    this.asset.emit('variantInit', this);

    //create cache id
    var md5 = crypto.createHash('md5');

    _.each(this.files, function(file) {
        var stat = fs.statSync(file);
        stat.isFile() && md5.update(fs.readFileSync(file));
    });

    this.cacheId = md5.digest('hex');

    _.bindAll(this);

    //now the uri can be built
    this.uri = AssetVariant.buildURI(asset.pattern, this.paramsWithCacheId);
};

AssetVariant.buildURI = function(pattern, params) {
    var uri = pattern.toString();

    _.each(params, function(v, k) {
        uri = uri.replace(':' + k, v);
    });

    return uri;
};

_.extend(AssetVariant.prototype, {
    _getParamsWithCacheId: function() {
        if (!this._paramsWithCacheId) {
            this._paramsWithCacheId = _.extend({
                cacheId: this.cacheId.substr(0, Asset.CACHE_ID_LENGTH)
            }, this.params);
        }

        return this._paramsWithCacheId;
    },
    _getCacheHeaders: function() {
        if (!this._cacheHeaders) {
            var headers = {},
                cacheControl = [],
                maxAge = this.asset.maxAge,
                d = moment(),
                httpFormat = 'ddd, DD MMM YYYY HH:mm:ss \\G\\M\\T';

            if (this.cachedFilePath) {
                var mtime = fs.statSync(this.cachedFilePath).mtime;
                d = moment(mtime);
            }

            //use utc for http headers
            d.utc();

            //Last-Modified
            headers['Last-Modified'] = d.format(httpFormat);

            //Expires
            d.add('seconds', maxAge);
            headers['Expires'] = d.format(httpFormat);

            //Cache-Control
            cacheControl.push('max-age=' + maxAge);
            cacheControl.push('public');
            headers['Cache-Control'] = cacheControl.join(', ');

            //ETag
            headers['Etag'] = this.cacheId;

            //X-Powered-By
            headers['X-Powered-By'] = 'Express/exstatic';

            this._cacheHeaders = headers;
        }

        return this._cacheHeaders;
    },
    renderFiles: function(cb) {
        var self = this,
            asset = self.asset,
            cache = self.renderCache = {};

        async.forEachSeries(
            this.files,
            function(file, forEachNext) {
                var basename = path.basename(file),
                    waterfall = [
                        //determine whether file is binary
                        function(waterfallNext) {
                            var filePath = './' + file,
                                stat = fs.statSync(filePath);

                            if (stat.size == 0) {
                                //don't be fooled by zero-size files
                                waterfallNext(null, '');
                            } else {
                                utils.fileIsBinary(filePath, function(err, isBinary) {
                                    if (isBinary) {
                                        var stat = fs.statSync(filePath);

                                        stat.size == 0 && (isBinary = null);
                                    }

                                    if (_.isNull(self.isBinary)) {
                                        self.isBinary = isBinary;

                                        //for now, assume anything not binary is utf8
                                        self.encoding = self.isBinary ? null : 'utf8';
                                    } else if (self.isBinary != isBinary) {
                                        //uh-oh, file types have been mixed in a group
                                        //don't do any more work on this group
                                        var msg = self.uri + ' file group contains both text and binary files and will not be rendered!'
                                        console.error(msg);
                                        console.error('The offending file is ' + filePath + ' and appears to have encoding ' + encoding);
                                        return forEachNext(msg);
                                    }

                                    var stat = fs.statSync(filePath),
                                        contents = stat.isFile() ? fs.readFileSync(filePath, self.encoding) : '';

                                    cache[file] = contents;
                                    waterfallNext();
                                });
                            }
                        }
                    ];

                _.each([ 'variantPreRenderFile', 'variantRenderFile', 'variantPostRenderFile' ], function(eventName) {
                    waterfall.push(eventHandler(self, eventName));
                });

                // TODO: should probably be handling any caught errors
                async.waterfall(waterfall, forEachNext);
            },
            cb
        );
    },
    render: function(cb) {
        var self = this;

        async.waterfall(
            [
                eventHandler(self, 'variantPreRender'),
                self.renderFiles,
                eventHandler(self, 'variantPostRender')
            ],
            function(err) {
                if (err) {
                    // do something to signal an error
                }

                var output = _.values(self.renderCache).join('');

                delete self.renderCache;

                cb(null, output);
            }
        );
    },
    saveRenderedFile: function(cb) {
        var self = this,
            fullpath = path.join(this.asset.cachePath, this.uri),
            created = [],
            pending = path.dirname(fullpath).split('/');

        pending[0] = '/' + pending[0];

        //create directories as needed
        while (pending.length) {
            created.push(pending.shift());

            var create = path.join.apply(path, created);

            if (!fs.existsSync(create)) {
                fs.mkdirSync(create, '0755');
            }
        }

        //render and save the output
        this.render(function(err, fileContents) {
            //not expecting an error
            fs.writeFileSync(fullpath, fileContents, self.encoding);

            self.cachedFilePath = fullpath;

            cb(null, fullpath);
        });
    },
    matchParams: function(params) {
        var myParams = params.cacheId
                        ? this.paramsWithCacheId
                        : this.params;

        return _.isEqual(params, myParams);
    }
});

module.exports = AssetVariant;
