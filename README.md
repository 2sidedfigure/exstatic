# exstatic

Connect/Express-style middleware to help with the bundling, minifying,
obfuscating and versioning of static assets for delivery over a CDN.

## Installation

```
$ npm install exstatic
```

## Quick Start

```javascript
var
express = require('express'),
exstatic = require('exstatic')(),
app = express();

exstatic.createAssetsFromDirectory(
    '/static/:version/:dirname/:basename.:cacheId:extname',
    __dirname + '/public'
    );

app.use(exstatic.middleware);

app.listen(80);
```

A directory structure like this:

```
app
 +- public
 |   +- css
 |   |   +- style.css
 |   +- js
 |       +- jquery.js
 |       +- app.js
 +- app.js
```

will generate asset URLs similar to the following:

```
GET /static/1359528874/css/style.d9b28cb1.css
GET /static/1359528874/js/jquery.83f534af.js
GET /static/1359528874/js/app.057d0df0.js
```

## Usage

### Startup options

exstatic can be started with some options to help structure generated URLs.

 - **host**: The host to prefix any generated URLs with.
 - **cachePath**: The path to store rendered file output.
 - **version**: A version string that may be used in the generated URLs.
 - **noCleanup**: Don't delete the files stored in the cache path when the
application exits.

```javascript
var exstatic = require('exstatic')({
                    host: 'http://example.com',
                    cachePath: __dirname + '/static_cache',
                    version: 'v1'
                });
```

### Specifying Assets

#### createAssetsFromDirectory(pattern, directory)

Creates versioned asset URLs from the contents of one or more directories.

**Arguments**

 - **pattern**: A pattern string to build the asset URLs. Variables in the
   pattern are preceded by a colon, just like path parameters in [Express
   routing](http://expressjs.com/api.html#app.VERB). The available variables
   are:

    - **:path**: The path of the asset relative to the directory argument from
      which is was found, stripped of all preceding *../*, if any.
    - **:dirname**: The directory component of **:path**.
    - **:basename**: The filename component of **:path**, without the extension.
    - **:extname**: The file extension component of **:path**.
    - **:version**: The version string specified in the startup options
      (defaults to a unix timestamp of when exstatic is `require`d).
    - **:cacheId**: A truncated MD5 hash of the file contents.

 - **directory**: A string or array of strings of directories of files to be
   served.

**Example**

```javascript
exstatic.createAssetsFromDirectory(
    '/static/:version/:dirname/:cacheId/:basename:extname',
    [
        './public/foo',
        './public/bar'
    ]
);
```

#### createAsset(type, settings)

Creates a single asset to be served with the specified settings.

**Arguments**

 - **type**: The preprocessing/compression strategy to use on this collection
   of files.
 - **settings**: An object containing the following parameters:

    - **id** *(required)*: A string identifier for this asset.
    - **pattern** *(required)*: A pattern string to build the asset URL.
      Variables in the pattern are preceded by a colon, just like path
      parameters in [Express routing](http://expressjs.com/api.html#app.VERB).
      The available variables are:

        - **:version**: The version string specified in the startup options
          (defaults to a unix timestamp of when exstatic is `require`d).
        - **:cacheId**: A truncated MD5 hash of the file contents.

    - **files** *(required)*: An array of strings of file paths to be
      preprocessed and/or compressed per the **type** argument, and be
      concatenated into a single file.
    - **preprocess**: An optional function to allow further preprocessing of a
      file, after any normal preprocessing done by that **type**, before being
      compressed and concatenated with the other members of the **files**
      array. The function receives three arguments: the path of the current
      file, the contents of the current file (a string if a text file, a buffer
      if binary), and a callback. The callback should be invoked when the work
      of the function is complete. The callback accepts two arguments: an error
      object (null if no error occurred) and the result of the processing of
      the file contents.

**Example**

```javascript
exstatic.createAsset(
    'javascript',
    {
        id: 'js/lib.js',
        pattern: '/static/:version/js/:cacheId/lib.js',
        files: [
            './public/lib/js/underscore.js',
            './public/lib/js/jquery.js',
            './public/lib/js/jquery.form2json.js',
            './public/lib/js/jquery.locus.js',
            './public/lib/js/backbone.js'
        ]
    }
);
```

### middleware

In order to start serving the defined assets and reference their generated URLs
from your templates, the exstatic middleware method must be `use`d by your
Express application:

```javascript
var
express = require('express'),
exstatic = require('exstatic')(),
app = express();

// assets get defined here
// express configuration gets started here

app.use(exstatic.middleware);

app.listen(80);
```

### Referencing the assets from templates

*N.B.: Currently, exstatic only provides a means for referencing assets for
[Mustache](http://mustache.github.com/)-style languages like
[Hogan.js](http://twitter.github.com/hogan.js/) and
[handlebars.js](https://github.com/wycats/handlebars.js/). (I'll gladly accept
patches to extend support!)*

To render the CDN-friendly asset URL from the asset defined in the above
`createAsset` example, just use the `{{#staticAssets}}` lambda:

```html
<!DOCTYPE html>
<html>
    <head>
        <title>exstatic!</title>

        <script type="text/javascript" src="{{#staticAssets}}js/lib.js{{/staticAssets}}></script>
    </head>
    <body>
    </body>
</html>
```

## Asset Types

When creating assets using `createAsset`, a type must be specified as the first
argument. The following types are currently available:

### Built-in

 - **javascript**: The *javascript* type uses
   [UglifyJS](https://github.com/mishoo/UglifyJS) to obfuscate and compress the
   supplied files before concatenating them into a single asset.
 - **stylus**: The *stylus* type uses
   [Stylus](http://learnboost.github.com/stylus/) to generate CSS from -- what
   else -- stylus files before compressing and concatenating them into a single
   asset.
 - **png**: The *png* type can only handle a single PNG image in it's files
   array. It will run [optipng](http://optipng.sourceforge.net/) using
   [node-optipng](https://github.com/papandreou/node-optipng) on the file and
   serve the compressed version.

### Additional Types

Additional types can be created simply by inheriting the `Asset` object defined
in *lib/Asset.js*. The built-in types (in *lib/assets/*) can help in getting
started.

## Examples

Examples are available with the git repository. Each requires Express v3.x, and
should be run from within it's own directory.

Assuming express is installed and accessible from where `git clone` is run:

```
$ git clone git@github.com:2sidedfigure/exstatic.git
$ cd exstatic/examples/js
$ node index.js
```
