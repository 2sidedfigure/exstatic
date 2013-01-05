"use strict";

var
    _ = require('underscore'),
    async = require('async'),
    fs = require('fs'),
    moment = require('moment'),
    path = require('path');

var StaticAsset = function(settings) {
    this.init(settings);
};

// static members
_.extend(StaticAsset, {
    CACHE_PATH: __dirname + '/cache_path',
    VERSION: 'v1',
    configure: function(opts) {
        opts = opts || {};

        StaticAsset.CACHE_ID = opts.cacheId;
        StaticAsset.CACHE_PATH = opts.cachePath || StaticAsset.CACHE_PATH;
        StaticAsset.VERSION = opts.version || 'v1';
        StaticAsset.COMPRESS = opts.compress;

        return StaticAsset;
    },
    // default compressors
    compressors: {
        none: function(file, data, cb) {
            cb(null, data);
        }
    },
    registerCompressor: function(id, handler, force) {
        if (StaticAsset.compressors[id] && !force) {
            console.warn("WARNING: There is already a compressor registered with the id '" + id + "'!");
            return false;
        }

        StaticAsset.compressors[id] = handler;
        return true;
    }
});

_.extend(StaticAsset.prototype, {
    init: function(settings) {
        settings = settings || {};

        //save the initial settings for later
        this.settings = settings;

        if (!settings.id) {
            throw new Error('StaticAsset must have an id!');
        }
        this.id = settings.id;

        if (!settings.files) {
            throw new Error('StaticAsset missing a valid set of files!');
        }
        this.files = settings.files;

        if (!settings.pattern) {
            throw new Error('StaticAsset missing a valid pattern!');
        }
        this.pattern = settings.pattern;

        //set the maximum age for the document in seconds
        this.maxAge = settings.maxAge || '3600' //one hour

        //set the compressor
        this.compressor = settings.compressor || 'none';
        //ensure we have a valid compressor type
        if (!_.contains(_.keys(StaticAsset.compressors), this.compressor)) {
            console.warn('WARNING: Invalid compressor type supplied for StaticAsset instance. Falling back to "none".');
            this.compressor = 'none';
        }

        //build the cacheId
        if (StaticAsset.CACHE_ID) {
            this.cacheId = StaticAsset.CACHE_ID;
        } else {
            // for development environments

            // get all the modified times for the files
            var mtimes = _.map(this.files, function(file) {
                var mtime = (fs.statSync(file) || {}).mtime || new Date(0);
                return Math.round(+mtime/1000);
            });

            // just take the largest and use that as the cacheId
            this.cacheId = Math.max.apply(Math, mtimes);
        }

        //expand the path pattern
        this._uri = this.pattern
                        .replace(/\:version/g, StaticAsset.VERSION)
                        .replace(/\:cacheId/g, this.cacheId);
        this.__defineGetter__('uri', function() {
            return this._uri;
        });

        //get the cache headers for this asset
        this.__defineGetter__('cacheHeaders', function() {
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

            return headers;
        });
    },
    render: function(cb) {
        // should be overridden for each distinct type of asset
        var self = this,
            output = [];

        async.forEachSeries(
            this.files,
            function(file, forEachNext) {
                var basename = '/* ' + path.basename(file) + ' */\n',
                    contents = fs.readFileSync('./' + file, 'utf8');

                async.waterfall(
                    [
                        //preprocess
                        function(waterfallNext) {
                            if (self.preprocess && _.isFunction(self.preprocess)) {
                                self.preprocess(file, contents, function(err, processedContents) {
                                    if (err) {
                                        console.error("ERROR: Couldn't preprocess file " + file);
                                        console.error(err);

                                        //complain, but just pass along the unprocessed contents (for now)
                                        return waterfallNext(null, contents);
                                    }

                                    return waterfallNext(null, processedContents);
                                });
                            } else {
                                waterfallNext(null, contents);
                            }
                        },
                        //compress
                        function(data, waterfallNext) {
                            if (StaticAsset.COMPRESS) {
                                StaticAsset.compressors[self.compressor](
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
                        output.push(basename + result);
                        forEachNext();
                    }
                );
            },
            function(err) {
                //not expecting an error
                cb(null, output.join('\n\n'));
            }
        );
    },
    saveRenderedFile: function(cb) {
        var fullpath = path.join(StaticAsset.CACHE_PATH, this.uri),
            created = [],
            pending = path.dirname(fullpath).split('/');

        pending[0] = '/' + pending[0];

        while (pending.length) {
            created.push(pending.shift());

            var create = path.join.apply(path, created);

            if (!path.existsSync(create)) {
                fs.mkdirSync(create, '0755');
            }
        }

        this.render(function(err, fileContents) {
            //not expecting an error
            fs.writeFileSync(fullpath, fileContents, 'utf8');

            cb(null, fullpath);
        });
    },
    fetchCachedPath: function(cb) {
        if (this.cachedPath) {
            cb(null, this.cachedPath);
        } else {
            var self = this;

            this.saveRenderedFile(function(err, cachedPath) {
                //not expecting an error
                self.cachedPath = cachedPath;
                cb(null, cachedPath);
            });
        }
    }
});

module.exports = StaticAsset.configure;
