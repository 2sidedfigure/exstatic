"use strict";

var
    _ = require('underscore'),
    utils = require('./utils'),
    inherits = require('util').inherits,
    EventEmitter = require('events').EventEmitter,
    AssetVariant = require('./AssetVariant'),

    // TODO: revise regexps to be better and include other possible URL chars
    urlParamMap = {
        'dirname': '([/\\w-\\.]+)',
        'extname': '([\\.\\w]+)',
        'path': '([/\\w-\\.]+)',
        '*': '([\\w-\\.]+)'
    };

var Asset = function(settings) {
    this.init(settings);
};

inherits(Asset, EventEmitter);

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
        this.maxAge = _.isNumber(settings.maxAge) && settings.maxAge >= 0
            ? settings.maxAge
            : 3600; //one hour

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
        utils.setupGetters(this);
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
    compress: function() {
        Asset.compressors[this.compressor].apply(this, arguments);
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

        variant.sendAsset(response);

        return true;
    },
    matchesURL: function(url) {
        return this.route.regexp.test(url);
    }
});

module.exports = Asset;
