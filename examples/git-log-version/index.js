"use strict";

var

// required modules
express = require('express'),
consolidate = require('consolidate'),
exec = require('child_process').exec,

// normally, require('exstatic')
exstatic = require('../../lib/AssetManager'),

// get an express application
app = express();

// any number of options can be used here to supply a version
//
//   $ git describe
//   $ echo "$NODE_ENV-$(git describe)
//   etc.
exec('git log -1 --format=%h', function(err, stdout, stderr) {
    // exstatic configuration object
    var version = stdout
                    ? stdout.replace(/\s+/, '')
                    : 'v0.0.0',
        conf = {
            cachePath: __dirname + '/static_cache',
            version: version,
            compress: true //could be based on NODE_ENV or a force compression flag
        },

        // get the exstatic static asset manager
        staticAssets = exstatic(conf);


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
                '../stylus/assets/style.styl'
            ]
        }
    );

    // set up the view engine
    app.engine('html', consolidate.hogan);
    app.set('view engine', 'html');
    app.set('views', __dirname + '/../multiple/views');

    // gzip the output
    app.use(express.compress());

    // use the exstatic middleware
    app.use(staticAssets.middleware);

    // handler for the index
    app.get('/', function(req, res) {
        res.render('index');
    });

    // start the server
    app.listen(8080);
});
