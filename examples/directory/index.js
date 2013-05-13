"use strict";

var

// required modules
express = require('express'),
consolidate = require('consolidate'),

// exstatic configuration object
conf = {
    cachePath: __dirname + '/static_cache',
    version: 'v1',
    compress: true //could be based on NODE_ENV or a force compression flag
},

// normally, require('exstatic')
exstatic = require('../../lib/AssetManager'),

// get the exstatic static asset manager
staticAssets = exstatic(conf),

// get an express application
app = express();

// register the static asset handler
staticAssets.createAssetsFromDirectory(
    '/static/:version/:dirname/:basename.:cacheId.css', // the path pattern to use
    '../stylus/assets' // a string or an array of folders of assets to be served
);

staticAssets.createAssetsFromDirectory(
    '/static/:version/:dirname/:basename.:cacheId:extname', // the path pattern to use
    [
        '../js/assets',
        '../png/assets'
    ]
);

// gzip the output
app.use(express.compress());

// use the exstatic middleware
app.use(staticAssets.middleware);

// start the server
app.listen(8080);
