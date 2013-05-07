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

    //preprocess
    _.each([ asset.preRender, asset.settings.preRender ], function(preRender) {
        if (!preRender || !_.isFunction(preRender)) {
            return;
        }

        preRender.call(this);
    }, this);

    //create cache id
    var md5 = crypto.createHash('md5');

    _.each(this.files, function(file) {
        var stat = fs.statSync(file);
        stat.isFile() && md5.update(fs.readFileSync(file));
    });

    this.cacheId = md5.digest('hex');

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
    preRender: function(cb) {
        var asset = this.asset,
            funcs = _.filter([
                asset.preRender,
                asset.settings.preRender
            ], function(f) { return f && _.isFunction(f); });

        async.forEachSeries(
            funcs,
            function(func, next) {
                f.call(this, next);
            },
            cb
        );
    },
    postRender: function(output, cb) {
        var asset = this.asset,
            funcs = _.filter([
                asset.postRender,
                asset.settings.postRender
            ], function(f) { return f && _.isFunction(f); });

        async.reduce(
            funcs,
            output,
            function(unprocessedOutput, func, reduceNext) {
                func.call(this, unprocessedOutput, function(err, processedOutput) {
                    if (err) {
                        console.error("ERROR: unable to postRender output");
                        console.error(err);

                        //complain, but just pass along the unprocessed contents (for now)
                        return reduceNext(null, unprocessedOutput);
                    }

                    return reduceNext(null, processedOutput);
                });
            },
            cb
        );
    },
    renderFiles: function(cb) {
        var self = this,
            asset = self.asset,
            output = [];

        async.forEachSeries(
            this.files,
            function(file, forEachNext) {
                var basename = path.basename(file);

                async.waterfall(
                    [
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

                                    waterfallNext(null, contents);
                                });
                            }
                        },
                        //preprocess
                        function(contents, waterfallNext) {
                            var funcs = [ asset.preRenderFile ];

                            _.isFunction(asset.settings.preRenderFile)
                                && funcs.push(_.bind(asset.settings.preRenderFile, asset));

                            async.reduce(
                                funcs,
                                contents,
                                function(unprocessedContents, func, reduceNext) {
                                    if (func && _.isFunction(func)) {
                                        func(file, unprocessedContents, function(err, processedContents) {
                                            if (err) {
                                                console.error("ERROR: Couldn't preprocess file " + file);
                                                console.error(err);

                                                //complain, but just pass along the unprocessed contents (for now)
                                                return reduceNext(null, unprocessedContents);
                                            }

                                            return reduceNext(null, processedContents);
                                        });
                                    } else {
                                        reduceNext(null, unprocessedContents);
                                    }
                                },
                                waterfallNext
                            );
                        },
                        //compress
                        function(data, waterfallNext) {
                            if (Asset.COMPRESS) {
                                Asset.compressors[asset.compressor](
                                    file,
                                    data,
                                    function(err, out) {
                                        //not expecting an error
                                        waterfallNext(null, out);
                                    }
                                );
                            } else {
                                waterfallNext(null, data);
                            }
                        }
                    ],
                    //append to output
                    function(err, result) {
                        output.push({ filename: basename, contents: result });
                        forEachNext();
                    }
                );
            },
            function(err) {
                if (err) {
                    return cb(err);
                }

                self.postRender(output, cb);
            }
        );
    },
    render: function(cb) {
        var self = this;

        this.preRender(function(err) {
            if (err) return cb(err);

            self.renderFiles(cb);
        });
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
