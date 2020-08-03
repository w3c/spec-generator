
var express = require("express")
,   { JSDOM } = require('jsdom')
,   app = express()
,   genMap = {
        respec: require("./generators/respec").generate
    }
,   num2 = function (num) {
        var str = num + "";
        if (str.length >= 2) return str;
        return "0" + str;
    }
,   path = require('path')
,   request = require("request")
,   URL = require('url').URL
,   fileUpload = require('express-fileupload')
,   BASE_URI = process.env.BASE_URI || ""
;
app.use(fileUpload({
    createParentPath: true,
    useTempFiles: true,
    tempFileDir: 'uploads/'
}));

// Listens to GET at the root, expects two required query string parameters:
//  type:   the type of the generator (case-insensitive)
//  url:    the URL to the source document
app.get("/", function (req, res) {
    var type = (req.query.type || "").toLowerCase()
    ,   url = req.query.url ? decodeURIComponent(req.query.url) : undefined
    ;
    if (!url || !type) return res.status(500).json({ error: "Both 'type' and 'url' are required." });
    if (!genMap[type]) return res.status(500).json({ error: "Unknown generator: " + type });
    // We look if the provided URL comes with a shortName in the query string
    var specURL = new URL(url);
    if (specURL.hostname === "raw.githubusercontent.com")
      return res.status(500).json({ error: "raw.githubusercontent.com URLs aren't supported. Use github pages instead."});
    var shortName = specURL.searchParams.get("shortName");

    let publishDate;
    if (specURL.searchParams.get("publishDate")) {
        publishDate = specURL.searchParams.get("publishDate");
    } else {
        const d = new Date();
        publishDate = [d.getFullYear(), num2(d.getMonth() + 1), num2(d.getDate())].join("-");
    }
    specURL.searchParams.set("publishDate", publishDate);

    // if shortName was provided, we collect info on previous version
    if (shortName) {
        request.get("https://www.w3.org/TR/" + shortName + "/", function(error, response, body) {
            if (error)
                return res.status(400).json({error: error});
            else if (response && response.statusCode >= 400 && response.statusCode < 500)
                return res.status(response.statusCode).json({error: response.statusMessage});
            var document = (new JSDOM(body)).window.document
            ,   dl = document.querySelector('body div.head dl')
            ,   thisURI
            ,   previousURI;
            if (dl) {
                dl.querySelectorAll('dt').forEach(dt => {
                    var txt = dt.textContent
                        .toLocaleLowerCase()
                        .replace(':', '')
                        .replace('published', '')
                        .trim();
                    var dd = dt.nextElementSibling;
                    if (txt === "this version")
                        thisURI = dd.querySelector('a').href;
                    else if (/^previous version(?:s)?$/.test(txt))
                        previousURI = dd.querySelector('a').href;
                });
            }
            if (!thisURI) return res.status(500).json({ error: "Couldn't find a 'This version' uri in the previous version." });
            var thisDate = thisURI.match(/[1-2][0-9]{7}/)[0]
            ,   prev     = (thisDate === publishDate.replace(/\-/g, '')) ? previousURI : thisURI
            ,   pDate    = prev.match(/[1-2][0-9]{7}/)[0];
            specURL.searchParams.set("previousMaturity", prev.match(/\/TR\/[0-9]{4}\/([A-Z]+)/)[1]);
            specURL.searchParams.set("previousPublishDate", pDate.substring(0, 4) + '-' +
            pDate.substring(4, 6) + '-' + pDate.substring(6, 8));
            generate(specURL.href);
        });
    } else {
        generate(specURL.href);
    }

    async function generate(url) {
        // if there's an error we get an err object with status and message, otherwise we get content
        try {
            const content = await genMap[type](url);
            res.send(content);
        } catch (err) {
            res.status(err.status).json({ error: err.message });
        }
    }
});

app.use('/uploads', express.static('./uploads', {
  setHeaders: (res, requestPath) => {
      let noExtension = !Boolean(path.extname(requestPath));
      if (noExtension) res.setHeader('Content-Type', 'text/html');
    }
}));

app.post("/", (req, res) => {
    try {
        if (!req.files) {
            res.send({
                status: 500,
                message: 'No file uploaded'
            });
        } else {
            let file = req.files.file;
            // file can be an html file or a tar file
            const fileType = require('file-type');
            const fs = require('fs');

            fs.readFile(file.tempFilePath, (err, content) => {
                fileType.fromBuffer(content).then(type => {
                  let path = ""
                  if (type && type.mime === 'application/x-tar') {
                      // tar file
                      var tar = require('tar-stream');
                      var extract = tar.extract();
                      var hasIndex = false;
                      path = fs.mkdtempSync('uploads/');

                      extract.on('entry', function (header, stream, next) {
                        stream.on('data', function (data) {
                          const isAllowed = function(name) {
                              if (name.toLowerCase().indexOf('.htaccess') !== -1) return false;
                              else if (name.toLowerCase().indexOf('.php') !== -1) return false;
                              else if (name.indexOf('CVS') !== -1) return false;
                              else if (name.indexOf('../') !== -1) return false;
                              else if (name.indexOf('://') !== -1) return false;
                              else return true;
                          }

                          if (isAllowed(header.name)) {
                            if (header.name === 'index.html') {
                              hasIndex = true;
                            }
                            var subPath = require('path').dirname(path + '/' + header.name);
                            require('mkdirp').sync(subPath);
                            fs.writeFileSync(path + '/' + header.name, data);
                          }
                        });
                        stream.on('end', function () {
                          next();
                        });

                        stream.resume();
                      });
                      extract.on('finish', function () {
                        if (!hasIndex) {
                          res.send({
                              status: 500,
                              message: 'No index.html file'
                          });
                        }
                      });
                      extract.end(fs.readFileSync(file.tempFilePath));

                  } else {
                      // assume it's an HTML file
                      path = file.tempFilePath
                  }
                  const baseUrl = req.protocol + "://" + req.headers.host + '/' + BASE_URI,
                        params = req.body ? Object.keys(req.body).map(key => key + '=' + req.body[key]).join('&') : "";
                        src = baseUrl  + path + ('?' + params || ""),
                        qs = {url: src, type: 'respec'};
                  request.get({url: baseUrl, qs: qs}, (err, response, body) => {
                      if (err) {
                          res.status(500).send(err);
                      } else {
                          res.send(body);
                          // delete temp file
                          require("fs").promises.unlink(file.tempFilePath);
                          require("fs").rmdirSync(path, { recursive: true });
                      }
                  });
                });
            });
        }
    } catch (err) {
        res.status(500).send(err);
    }
});

/**
* Start listening for HTTP requests.
*
* @param {Number} port - port number to use (optional); defaults to environment variable `$PORT` if exists, and to `80` if not
* @returns {Object} a `http.Server`; cf https://nodejs.org/dist/latest-v8.x/docs/api/http.html#http_class_http_server
*/

app.start = (port) => {
    if (port)
        return app.listen(port);
    else
        return app.listen(process.env.PORT || 80);
};

if (module === process.mainModule)
    app.start();
else
    module.exports = app;
