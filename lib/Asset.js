"use strict";

var
    _ = require('underscore'),
    async = require('async'),
    fs = require('fs'),
    moment = require('moment'),
    path = require('path'),
    crypto = require('crypto'),
    mmm = require('mmmagic'),
    magic = new mmm.Magic(mmm.MAGIC_MIME_ENCODING),

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
    };

var Asset = function(settings) {
    this.init(settings);
};

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

        //make sure all methods are bound to `this`
        _.bindAll(this);

        //define getters
        setupGetters(this);
    },
    _getCacheId: function() {
        if (!this._cacheId) {
            var md5 = crypto.createHash('md5');

            _.each(this.files, function(file) {
                var stat = fs.statSync(file);
                stat.isFile() && md5.update(fs.readFileSync(file));
            });

            this._cacheId = md5.digest('hex').substr(0, Asset.CACHE_ID_LENGTH);
        }

        return this._cacheId;
    },
    _getUri: function() {
        if (!this._uri) {
            //expand the path pattern
            this._uri = this.pattern
                            .replace(/\:version/g, Asset.VERSION)
                            .replace(/\:cacheId/g, this.cacheId);
        }

        return this._uri;
    },
    _getCacheHeaders: function() {
        if (!this._cacheHeaders) {
            var headers = {},
                cacheControl = [],
                d = moment(),
                httpFormat = 'ddd, DD MMM YYYY HH:mm:ss \\G\\M\\T';

            if (this.cachedPath) {
                var mtime = fs.statSync(this.cachedPath).mtime;
                d = moment(mtime);
            }

            //use utc for http headers
            d.utc();

            //Last-Modified
            headers['Last-Modified'] = d.format(httpFormat);

            //Expires
            d.add('seconds', this.maxAge);
            headers['Expires'] = d.format(httpFormat);

            //Cache-Control
            cacheControl.push('max-age=' + this.maxAge);
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
        // should be overridden for each distinct type of asset
        var self = this,
            output = [];

        async.forEachSeries(
            this.files,
            function(file, forEachNext) {
                var basename = '/* ' + path.basename(file) + ' */\n';

                async.waterfall(
                    [
                        //determine whether file is binary
                        function(waterfallNext) {
                            var filePath = './' + file;

                            magic.detectFile(filePath, function(err, encoding) {
                                var isBinary = encoding == 'binary';

                                if (_.isNull(self.isBinary)) {
                                    self.isBinary = isBinary;

                                    //mmmagic doesn't output fs.readFile friendly encoding
                                    //strings, so for now, anything not binary we'll assume
                                    //is utf8
                                    self.encoding = self.isBinary ? null : 'utf8';
                                } else if (self.isBinary != isBinary) {
                                    //uh-oh, file types have been mixed in a group
                                    //don't do any more work on this group
                                    return forEachNext(self.uri + ' file group contains both text and binary files and will not be rendered!');
                                }

                                var stat = fs.statSync(filePath),
                                    contents = stat.isFile() ? fs.readFileSync(filePath, self.encoding) : '';

                                waterfallNext(null, contents);
                            });
                        },
                        //preprocess
                        function(contents, waterfallNext) {
                            var funcs = [ self.preprocess ];

                            _.isFunction(self.settings.preprocess)
                                && funcs.push(_.bind(self.settings.preprocess, self));

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
                                Asset.compressors[self.compressor](
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
                        self.encoding && (result = basename + result);

                        output.push(result);
                        forEachNext();
                    }
                );
            },
            function(err) {
                if (err) {
                    return cb(err);
                }

                cb(null, output.length > 1 ? output.join('\n\n') : output[0]);
            }
        );
    },
    saveRenderedFile: function(cb) {
        var self = this,
            fullpath = path.join(this.cachePath, this.uri),
            created = [],
            pending = path.dirname(fullpath).split('/');

        pending[0] = '/' + pending[0];

        //create directories as needed
        while (pending.length) {
            created.push(pending.shift());

            var create = path.join.apply(path, created);

            if (!path.existsSync(create)) {
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
    fetchCachedPath: function(cb) {
        if (this.cachedFilePath) {
            cb(null, this.cachedFilePath);
        } else {
            var self = this;

            this.saveRenderedFile(function(err, cachedFilePath) {
                //not expecting an error
                self.cachedFilePath = cachedFilePath;
                cb(null, cachedFilePath);
            });
        }
    }
});

module.exports = Asset;
