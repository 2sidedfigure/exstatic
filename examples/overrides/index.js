"use strict";

var

// required modules
express = require('express'),
consolidate = require('consolidate'),
_ = require('underscore'),

// exstatic configuration object
conf = {
    cachePath: __dirname + '/static_cache',
    version: 'v0.0.0',
    compress: true //could be based on NODE_ENV or a force compression flag
},

// load and configure exstatic
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

// register the static asset handlers
var

css = staticAssets.createAsset(
    'stylus', // the type of asset we're working with
    { // the settings object
        id: 'css/style.css',
        pattern: '/static/:version/:cacheId/:jquery/css/style.css', // the path pattern to use
        imports: [
            '../stylus/assets/color.styl'
        ],
        files: [ // a list of the assets to include in the bundle
            '../stylus/assets/style.styl',
            '../stylus/assets/addtl.styl',
            'assets/logo.styl'
        ]
    }
),

js = staticAssets.createAsset(
    'javascript',
    {
        id: 'js/lib.js',
        pattern: '/static/:version/:cacheId/:jquery/js/lib.js',
        files: [
            '../js/assets/jquery.js',
            '../js/assets/jquery.form2json.js',
            '../js/assets/jquery.locus.js',
            '../js/assets/underscore.js',
            '../js/assets/backbone.js',
            '../js/assets/mustache.js',
            '../js/assets/moment.js'
        ]
    }
),

logo = staticAssets.createAsset(
    'png',
    {
        id: 'img/logo.png',
        pattern: '/static/:version/:cacheId/:jquery/img/logo.png',
        files: [
            'assets/jquery/logo.png'
        ]
    }
);

// set up asset event handlers to modify the assets based on
// passed parameters
css.on('variantInit', function(variant, cb) {
    variant.imports = [].concat(variant.asset.settings.imports);

    var dir = variant.params.jquery
        ? 'jquery'
        : 'zepto';

    variant.imports.push('assets/' + dir + '/color.styl');

    cb();
});

js.on('variantInit', function(variant, cb) {
    if (variant.params.jquery) return cb();

    variant.files = _.filter(variant.files, function(f) {
        return !/jquery/i.test(f);
    });

    variant.files.unshift('../js/assets/zepto.js');

    cb();
});

logo.on('variantInit', function(variant, cb) {
    if (variant.params.jquery) return cb();

    variant.files = [ 'assets/zepto/logo.png' ];

    cb();
});

// use the exstatic middleware
app.use(staticAssets.middleware);

// handler for the index
app.get('/', function(req, res) {
    var useJQuery = { jquery: +req.param('jquery', true) };

    res.locals.staticParams = useJQuery;

    res.render('index', useJQuery);
});

// start the server
app.listen(8080);
