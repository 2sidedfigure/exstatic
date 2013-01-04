"use strict";

var

// required modules
express = require('express'),
consolidate = require('consolidate'),

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
        'Stylus', // the type of asset we're working with
        { // the settings object
            id: 'css_style',
            pattern: '/static/:version/:cacheId/css/style.css', // the path pattern to use
            files: [ // a list of the assets to include in the bundle
                'assets/style.stylus',
                'assets/addtl.stylus'
            ]
        }
    ),

// get an express application
app = express();

// set up the view engine
app.engine('html', consolidate.hogan);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

// use the exstatic middleware
app.use(exstatic.middleware);

// handler for the index
app.get('/', function(req, res) {
    res.render('index');
});

// start the server
app.listen(8080);

// exstatic should print a debug line for indicating the URL of the registered asset.
// have a look by running:
//
// $ curl localhost:8080/<url_from_debug>
