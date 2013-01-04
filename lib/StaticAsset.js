"use strict";

var
    _ = require('underscore'),
    fs = require('fs'),
    path = require('path'),
    jsParser = require('uglify-js').parser,
    compressor = require('uglify-js').uglify;

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
        js: function(data) {
            try {
                var ast = compressor.ast_squeeze(compressor.ast_mangle(jsParser.parse(data)));
                return ';' + compressor.gen_code(ast);
            } catch (ex) {
                console.error('ERROR: JS compressor error.');
                console.error(ex);
                return data;
            }
        },
        css: function(data) {
        },
        none: function(data) {
            return data;
        }
    }
});

StaticAsset.prototype.__defineGetter__('uri', function() {
    return this._uri;
});

_.extend(StaticAsset.prototype, {
    init: function(settings) {
        settings = settings || {};

        //save the initial settings for later
        this.settings = settings;

        if (!settings.files) {
            throw new Error('StaticAsset missing a valid set of files!');
        }
        this.files = settings.files;

        if (!settings.pattern) {
            throw new Error('StaticAsset missing a valid pattern!');
        }
        this.pattern = settings.pattern;

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
    },
    render: function() {
        // should be overridden for each distinct type of asset
        var output = [];

        _.each(this.files, function(file) {
            var basename = "/* " + path.basename(file) + " */\n",
                contents = fs.readFileSync('./' + file, 'utf8');

            if (StaticAsset.COMPRESS) {
                contents = StaticAsset.compressors[this.compressor](contents);
            }

            output.push(basename + contents);
        }, this);

        return output.join("\n\n");
    },
    saveRenderedFile: function() {
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

        fs.writeFileSync(fullpath, this.render(), 'utf8');

        return fullpath;
    },
    fetchCachedPath: function() {
        if (!this.cachedPath) {
            this.cachedPath = this.saveRenderedFile();
        }

        return this.cachedPath;
    }
});

module.exports = StaticAsset.configure;
