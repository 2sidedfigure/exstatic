"use strict";

var

// required modules
express = require('express'),
consolidate = require('consolidate'),
exec = require('child_process').exec,

exstatic, app;

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
        };

    // load and configure exstatic
    // normally, require('exstatic')(conf)
    exstatic = require('../../lib/AssetManager')(conf);

    // register the static asset handler
    exstatic.createAsset(
        'png', // the type of asset we're working with
        { // the settings object
            id: 'img/test.png',
            pattern: '/static/:version/:cacheId/img/test.png', // the path pattern to use
            files: [ // a list of the assets to include in the bundle
                '../png/assets/test.png'
            ]
        }
    );
    exstatic.createAsset(
        'stylus',
        {
            id: 'css/style.css',
            pattern: '/static/:version/:cacheId/css/style.css',
            files: [
                '../multiple/assets/style.stylus'
            ]
        }
    );

    // get an express application
    app = express();

    // set up the view engine
    app.engine('html', consolidate.hogan);
    app.set('view engine', 'html');
    app.set('views', __dirname + '/../multiple/views');

    // gzip the output
    app.use(express.compress());

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
});
