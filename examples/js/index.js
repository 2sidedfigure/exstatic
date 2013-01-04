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

// load and configure exstatic
// normally, require('exstatic')(conf)
exstatic = require('../../lib/StaticAssetManager')(conf),

// register the static asset handler
sa = exstatic.createAsset(
        'JS', // the type of asset we're working with
        { // the settings object
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
    ),

// get an express application
app = express();

// use the exstatic middleware
app.use(exstatic.middleware);

// start the server
app.listen(8080);

// exstatic should print a debug line for indicating the URL of the registered asset.
// have a look by running:
//
// $ curl localhost:8080/<url_from_debug>
