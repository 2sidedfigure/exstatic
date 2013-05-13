"use strict";

var

// required modules
express = require('express'),

// exstatic configuration object
conf = {
    cachePath: __dirname + '/static_cache',
    version: 'v0.0.0',
    compress: true //could be based on NODE_ENV or a force compression flag
},

// normally, require('exstatic')
exstatic = require('../../lib/AssetManager'),

// get the exstatic static asset manager
staticAssets = exstatic(conf),

// get an express application
app = express();

// gzip the output
app.use(express.compress());

// register the static asset handler
staticAssets.createAsset(
    'javascript', // the type of asset we're working with
    { // the settings object
        id: 'js/lib/shared.js',
        pattern: '/static/:version/:cacheId/js/sharedLibs.js', // the path pattern to use
        files: [ // a list of the assets to include in the bundle
            'assets/jquery.js',
            'assets/jquery.form2json.js',
            'assets/jquery.locus.js',
            'assets/underscore.js',
            'assets/backbone.js',
            'assets/mustache.js',
            'assets/moment.js'
        ]
    }
);

// use the exstatic middleware
app.use(staticAssets.middleware);

// start the server
app.listen(8080);
