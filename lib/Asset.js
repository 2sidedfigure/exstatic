"use strict";

var
    _ = require('underscore'),
    async = require('async'),
    fs = require('fs'),
    moment = require('moment'),
    path = require('path'),
    crypto = require('crypto'),
    mmm, magic,
    exec = require('child_process').exec,

    //utilities
    lcFirst = function(str) {
        var arr = str.split('');

        arr[0] = arr[0].toLowerCase();

        return arr.join('');
    },

    setupGetters = function(obj) {
        var funcs = _.functions(obj),
            getters = _.filter(funcs, function(f) { return /^_get\w+/.test(f); }),
            removeRE = /^_get/;

        _.each(getters, function(f) {
            var name = lcFirst(f.replace(removeRE, ''));
            obj.__defineGetter__(name, obj[f]);
        });
    },

    fileIsBinary = function(file, cb) {
        if (magic && magic.detectFile) {
            magic.detectFile(file, function(err, encoding) {
                cb(null, encoding == 'binary');
            });
        } else {
            //falling back to the BSD file command.
            //sorry windows users, make mmmagic work or submit a patch
            exec('file -bi ' + file, function(err, stdout, stderr) {
                cb(err || stderr, stdout.indexOf('text') == -1);
            });
        }
    },

    // TODO: revise regexps to be better and include other possible URL chars
    urlParamMap = {
        'dirname': '([/\\w-\\.]+)',
        'extname': '([\\.\\w]+)',
        'path': '([/\\w-\\.]+)',
        '*': '([\\w-\\.]+)'
    };

//try loading mmmagic
try {
    mmm = require('mmmagic');
    magic = new mmm.Magic(mmm.MAGIC_MIME_ENCODING);
} catch (ex) {
    mmm = magic = null;
}

var Asset = function(settings) {
    this.init(settings);
},

// should be able to create an asset variant
//   1. knowing the full path, and parsing the settings from the URL
//   2. knowing the settings, building the path and asset
AssetVariant = function(settings, asset) {
    settings = settings || {};

    setupGetters(this);

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

    var self = this;

    this.saveRenderedFile(function(err, filePath) {
        var method = 'log',
            msg = [ 'Rendered asset ' ];

        if (err) {
            method = 'error';
            msg = [ 'Unable to render asset ', err ];
        } else {
            self.cachedFilePath = filePath;
        }

        msg[0] += self.uri;
        console[method].apply(console, msg);
    });
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
    render: function(cb) {
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
                                fileIsBinary(filePath, function(err, isBinary) {
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

                asset.postRender(output, cb);
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

// static members
_.extend(Asset, {
    CACHE_PATH: __dirname + '/cache_path',
    VERSION: 'v1',
    CACHE_ID_LENGTH: 8,
    configure: function(opts) {
        opts = opts || {};

        Asset.CACHE_PATH = opts.cachePath || Asset.CACHE_PATH;
        Asset.VERSION = opts.version || Asset.VERSION;
        Asset.COMPRESS = opts.compress;

        return Asset;
    },
    // default compressors
    compressors: {
        none: function(file, data, cb) {
            cb(null, data);
        }
    },
    registerCompressor: function(id, handler, force) {
        if (Asset.compressors[id] && !force) {
            console.warn("WARNING: There is already a compressor registered with the id '" + id + "'!");
            return false;
        }

        Asset.compressors[id] = handler;
        return true;
    }
});

_.extend(Asset.prototype, {
    init: function(settings) {
        settings = settings || {};

        //save the initial settings for later
        this.settings = settings;

        if (!settings.id) {
            throw new Error('Asset must have an id!');
        }
        this.id = settings.id;

        if (!settings.files) {
            throw new Error('Asset missing a valid set of files!');
        }
        this.files = settings.files;

        if (!settings.pattern) {
            throw new Error('Asset missing a valid pattern!');
        }
        this.pattern = settings.pattern;

        //necessary for reading the contents of binary files (e.g. images)
        this.isBinary = null;

        //a reference to the asset manager
        this.manager = settings.manager;

        //set the maximum age for the document in seconds
        this.maxAge = settings.maxAge || '3600' //one hour

        //set the compressor
        this.compressor = settings.compressor || 'none';
        //ensure we have a valid compressor type
        if (!_.contains(_.keys(Asset.compressors), this.compressor)) {
            console.warn('WARNING: Invalid compressor type supplied for Asset instance. Falling back to "none".');
            this.compressor = 'none';
        }

        //where to cache the rendered file
        this.cachePath = settings.cachePath || Asset.CACHE_PATH;

        this.variants = [];
        this.variantAliases = {};

        //make sure all methods are bound to `this`
        _.bindAll(this);

        //define getters
        setupGetters(this);
    },
    createVariant: function(params) {
        var settings = {
                params: _.extend({ version: Asset.VERSION }, params)
            },
            variant = new AssetVariant(settings, this);

        this.variants.unshift(variant); // make sure the newest are always at the front

        if (!variant.matchParams(settings.params)) {
            // the cacheId values are different, create an alias
            var key = AssetVariant.buildURI(this.pattern, settings.params);

            this.variantAliases[key] = variant;
        }

        return variant;
    },
    getParamsFromURI: function(uri) {
        var params = this.route.regexp.exec(uri);

        params.shift();

        return _.object(this.route.params, params);
    },
    getURI: function(params) {
        var variant = _.find(this.variants, function(v) { return v.matchParams(params); })
            || this.createVariant(params);

        return variant.uri;
    },
    _getRoute: function() {
        if (!this._route) {
            var getNamedParams = function(pattern, matches) {
                    matches = matches || [];

                    if (pattern.length) {
                        var m = /[^:]*(?:\:(\w+))*/.exec(pattern);

                        m[1] && matches.push(m[1]);
                        matches = getNamedParams(pattern.replace(m[0], ''), matches);
                    }

                    return matches;
                },
                params = getNamedParams(this.pattern),
                reSource = this.pattern.toString();

            _.each(params, function(param) {
                var replace = urlParamMap[param] || urlParamMap['*'];

                reSource = reSource.replace(':' + param, replace);
            });

            this._route = {
                params: params,
                regexp: new RegExp(reSource, 'i')
            };
        }

        return this._route;
    },
    postRender: function(data, cb) {
        var arr = this.encoding
                        ? _.map(data, function(item) {
                                return '/* ' + item.filename + ' */\n' + item.contents;
                            })
                        : _.pluck(data, 'contents'),
            output = arr.length > 1
                        ? arr.join('\n\n')
                        : arr[0];

        cb(null, output);
    },
    sendAsset: function(uri, response) {
        //expects a uri string and an express response object
        if (!uri || !response) {
            return false;
        }

        // check for uri matches, then for aliases
        // (use indexOf in case there's a query string)
        var variant = _.find(this.variants, function(v) { return uri.indexOf(v.uri) > -1; })
                        || _.find(this.variantAliases, function(v, k) { return uri.indexOf(k) > -1; });

        // if no variant, make a new one
        variant = variant || this.createVariant(this.getParamsFromURI(uri));

        response.set(variant.cacheHeaders);

        if (variant.cachedFilePath) {
            response.sendfile(variant.cachedFilePath);
        } else {
            variant.saveRenderedFile(function(err, filePath) {
                response.sendfile(filePath);
            });
        }

        return true;
    },
    matchesURL: function(url) {
        return this.route.regexp.test(url);
    }
});

module.exports = Asset;
