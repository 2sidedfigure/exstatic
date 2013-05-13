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
exstatic = require('exstatic'),
staticAssets = exstatic(),
app = express();

staticAssets.createAssetsFromDirectory(
    '/static/:version/:dirname/:basename.:cacheId:extname',
    __dirname + '/public'
    );

app.use(staticAssets.middleware);

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
 - **typeSearchPath**: A string or an array of strings of paths that should be
   searched to find asset type libraries.

```javascript
var exstatic = require('exstatic')
    staticAssets = exstatic({
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
staticAssets.createAssetsFromDirectory(
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
      *Exstatic* exposes the following variables:

        - **:version**: The version string specified in the startup options
          (defaults to a unix timestamp of when exstatic is `require`d).
        - **:cacheId**: A truncated MD5 hash of the file contents.

    - **files** *(required)*: An array of strings of file paths to be
      processed and/or compressed per the **type** argument, and be
      concatenated into a single file.

   *Note*: Some asset types may define additional settings.

**Example**

```javascript
staticAssets.createAsset(
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
exstatic = require('exstatic')
staticAssets = exstatic(),
app = express();

// assets get defined here
// express configuration gets started here

app.use(staticAssets.middleware);

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

## Assets

Assets are the fundamental building block of *exstatic*. They are the
definitions of static content your application will serve, with the help of
*exstatic*'s [middleware](#middleware).

### Asset Types

When creating assets using `createAsset`, a type must be specified as the first
argument. The following types are currently available:

#### Built-in

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

#### Additional Types

Additional types can be created simply by inheriting the `Asset` object defined
in *lib/Asset.js*. The built-in types (in *lib/assets/*) can help in getting
started.

To use your own types, make sure the folder they're kept in is included in the
`typeSearchPath` setting initially passed to exstatic.

### Asset Variations

An individual asset may have multiple variations. Asset variations are
distinguished by the values used for variables in the Asset's pattern, which
defines a unique URL for the variation. *Exstatic* defines and assigns values
for some pattern variables by default, namely, `version` and `cacheId`.
Additional pattern variables can be defined by a colon prefixed identifier in
the Asset's pattern string (e.g., `:myvariable`), which can then be used to
create additional variations of an Asset with the help of event handlers.

When an Asset's pattern is matched for an incoming request, but no matching
variation exists to create a response, a new Asset variation is created. The
new variation then enters the *render pipeline* to build a response. The
*render pipeline* is a procedure generally represented by the following steps:

 1. The new Asset variation is initialized.
 2. Each of the component files of the Asset variation are processed as defined
    by the Asset type.
 3. Once all the files have been processed, the variation is cached and sent as
    a response.

#### Events

During the render process, the Asset variation maintains a cache of processed
output of each file. Events are the means to modify the Asset variation and the
output at various points of the *render pipeline*.

An Asset may emit the following events when building a new variation:

 - **variantInit**: emitted when a URL has no existing matching variations, and
   a new variation is initialized to build a response.
 - **variantPreRender**: emitted just before the process of rendering the Asset
   variation begins.
 - **variantPreRenderFile**: emitted before the process of rendering an
   individual file comprising the asset.
 - **variantRenderFile**: emitted after prerendering and just before rendering
   an individual file comprising the asset.
 - **variantPostRenderFIle**: emitted when rendering an individual file
   comprising the asset is complete.
 - **variantPostRender**: emitted when all files comprising the asset have
   completed rendering.

##### Handlers for *variantInit*, *variantPreRender*, and *variantPostRender*

**Arguments**

 - **variant**: a reference to the Asset variation.
 - **callback**: a function that when called, signals the *render pipeline* to
   resume processing the Asset variation. An error may be raised by passing an
   expression that evaluates to `true` as the first argument.

##### Handlers for *variantPreRenderFile*, *variantRenderFile*, and
      *variantPostRenderFile*

**Arguments**

 - **variant**: a reference to the Asset variation.
 - **file**: a string of the path of the file currently being processed. This
   can be used to get/set the current state of the output of the file using the
   following methods of the Asset variation:

   - **getRenderCache(file)**: retrieve the current state of the output for the
     given file.
   - **setRenderCache(file, contents)**: set the current state of the output
     for the given file.

 - **callback**: a function that when called, signals the *render pipeline* to
   resume processing the Asset variation. An error may be raised by passing an
   expression that evaluates to `true` as the first argument.

## Examples

Examples are available with the git repository. Each requires Express v3.x, and
should be run from within it's own directory.

Assuming express is installed and accessible from where `git clone` is run:

```
$ git clone git@github.com:2sidedfigure/exstatic.git
$ cd exstatic/examples/js
$ node index.js
```
## Author

± ryan (ryan@2-si.de). Development was and continues to be sponsored by
[YellowBot](http://www.yellowbot.com).

## License

Copyright (c) 2013 Ryan Ettipio

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
