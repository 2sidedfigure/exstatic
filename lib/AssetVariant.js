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

    eventHandler = function(variant, eventName, file) {
        var errorMessage = "Error during the " + eventName,
            emitArgs = [eventName, variant];

        file && (errorMessage += " for file " + file);
        return function(cb) {
            var count = 0,
                listenerCount = (variant.asset.listeners(eventName) || []).length,
                listenerCb = function(err) {
                    if (err) {
                        console.error(errorMessage);
                        console.error(err);
                        return cb(err);
                    }

                    if (++count >= listenerCount) cb();
                };

            file && emitArgs.push(file);
            emitArgs.push(listenerCb);

            if (listenerCount) {
                variant.asset.emit.apply(variant.asset, emitArgs);
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
    this.expires = moment();

    _.bindAll(this);

    eventHandler(this, 'variantInit')(this.ensureURI);
};

AssetVariant.buildURI = function(pattern, params) {
    var uri = pattern.toString();

    _.each(params, function(v, k) {
        uri = uri.replace(':' + k, v);
    });

    return uri;
};

_.extend(AssetVariant.prototype, {
    _getCacheId: function() {
        this._cacheId = this._cacheId || this.hashFiles();

        return this._cacheId;
    },
    _getParamsWithCacheId: function() {
        if (!this._paramsWithCacheId) {
            this._paramsWithCacheId = _.extend({
                cacheId: this.cacheId.substr(0, Asset.CACHE_ID_LENGTH)
            }, this.params);
        }

        return this._paramsWithCacheId;
    },
    _getCacheHeaders: function() {
        var now = moment(),
            d = moment();

        if ( this.cachedFilePath && !this.isExpired() ) {
            var mtime = fs.statSync(this.cachedFilePath).mtime;
            d = moment(mtime);
        }

        if ( !this._cacheHeaders || this.isExpired() ) {
            var headers = {},
                cacheControl = [],
                maxAge = this.asset.maxAge,
                httpFormat = 'ddd, DD MMM YYYY HH:mm:ss \\G\\M\\T';

            //use utc for http headers
            d.utc();

            //Last-Modified
            headers['Last-Modified'] = d.format(httpFormat);

            //Expires
            this.expires = d.add('seconds', maxAge);
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
    ensureURI: function() {
        this.uri = this.uri || AssetVariant.buildURI(this.asset.pattern, this.paramsWithCacheId);
    },
    isExpired: function() {
        var now = moment();

        return now >= this.expires;
    },
    hashFiles: function() {
        var md5 = crypto.createHash('md5');

        _.each(this.files, function(file) {
            var stat = fs.statSync(file);
            stat.isFile() && md5.update(fs.readFileSync(file));
        });

        return md5.digest('hex');
    },
    getRenderCache: function(file) {
        return this._renderCache && this._renderCache[file];
    },
    setRenderCache: function(file, data) {
        this._renderCache = this._renderCache || {};
        this._renderCache[file] = data;
    },
    concatRenderCache: function() {
        // TODO: add different handler (or error) for binary files
        var values = _.values(this._renderCache);
        return values.length > 1
            ? values.join('')
            : values[0];
    },
    clearRenderCache: function() {
        delete this._renderCache;
    },
    renderFiles: function(cb) {
        var self = this,
            asset = self.asset;

        this.clearRenderCache();

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
                                self.setRenderCache(file, '');
                                waterfallNext();
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

                                    self.setRenderCache(file, contents);
                                    waterfallNext();
                                });
                            }
                        }
                    ];

                _.each([ 'variantPreRenderFile', 'variantRenderFile', 'variantPostRenderFile' ], function(eventName) {
                    waterfall.push(eventHandler(self, eventName, file));
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

                var output = self.concatRenderCache();

                self.clearRenderCache();

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
    sendAsset: function(response) {
        var self = this;

        if (this.isExpired()) {
            //null out cache headers and cache id
            this._cacheHeaders = null;

            if (this.hashFiles() != this.cacheId) {
                //ensure the file is re-rendered by nulling the
                //appropriate internal properties
                this._cacheId = null;
                this._paramsWithCacheId = null;

                //delete the cached file before removing the reference to it
                fs.unlinkSync(this.cachedFilePath);
                this.cachedFilePath = null;
                this.uri = null;
            }
        }

        response.set(this.cacheHeaders);

        if (this.cachedFilePath) {
            return response.sendfile(this.cachedFilePath);
        }

        this.ensureURI();
        this.saveRenderedFile(function(err, filePath) {
            var method = 'log',
                msg = [ 'Rendered asset ' ];

            if (err) {
                method = 'error';
                msg = [ 'Unable to render asset ', err ];
            }

            msg[0] += self.uri;
            console[method].apply(console, msg);

            response.sendfile(filePath);
        });
    },
    matchParams: function(params) {
        var myParams = params.cacheId
                        ? this.paramsWithCacheId
                        : this.params;

        // basic "deep" comparison
        return JSON.stringify(params) == JSON.stringify(myParams);
    }
});

module.exports = AssetVariant;
