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

// normally, require('exstatic')
exstatic = require('../../lib/AssetManager'),

// get the exstatic static asset manager
staticAssets = exstatic(conf),

// get an express application
app = express();

// set up the view engine
app.engine('html', consolidate.hogan);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

// gzip the output
app.use(express.compress());

// register the static asset handler
staticAssets.createAsset(
    'png', // the type of asset we're working with
    { // the settings object
        id: 'img/test.png',
        pattern: '/static/:version/:cacheId/img/test.png', // the path pattern to use
        files: [ // a list of the assets to include in the bundle
            '../png/assets/test.png'
        ]
    }
);

staticAssets.createAsset(
    'stylus',
    {
        id: 'css/style.css',
        pattern: '/static/:version/:cacheId/css/style.css',
        files: [
            'assets/style.stylus'
        ]
    }
);

// use the exstatic middleware
app.use(staticAssets.middleware);

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
