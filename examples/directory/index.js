"use strict";

var

// required modules
express = require('express'),
consolidate = require('consolidate'),
exec = require('child_process').exec,

// exstatic configuration object
conf = {
    cachePath: __dirname + '/static_cache',
    version: 'v1',
    compress: true //could be based on NODE_ENV or a force compression flag
},

// load and configure exstatic
// normally, require('exstatic')(conf)
exstatic = require('../../lib/AssetManager')(conf),

// get an express application
app = express();

// register the static asset handler
exstatic.createAssetsFromDirectory(
    '/static/:version/:dirname/:basename.:cacheId.css', // the path pattern to use
    '../stylus/assets' // a string or an array of folders of assets to be served
);

exstatic.createAssetsFromDirectory(
    '/static/:version/:dirname/:basename.:cacheId:extname', // the path pattern to use
    [
        '../js/assets',
        '../png/assets'
    ]
);

// gzip the output
app.use(express.compress());

// use the exstatic middleware
app.use(exstatic.middleware);

// start the server
app.listen(8080);

// exstatic should print a debug line for indicating the URL of the registered asset.
// have a look by running:
//
// $ curl localhost:8080/<url_from_debug>
