
var express = require("express")
,   app = express()
,   genMap = {
        respec: require("./generators/respec").generate
    }
,   num2 = function (num) {
        var str = num + "";
        if (str.length >= 2) return str;
        return "0" + str;
    }
,   request = require("request")
;

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
    var shortName = specURL.searchParams.get("shortName");

    let publishDate;
    if (req.query.publishDate) {
        publishDate = req.query.publishDate;
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
            var $   = require('whacko').load(body)
            ,   $dl = $("body div.head dl")
            ,   thisURI
            ,   previousURI;
            if ($dl) {
                $dl.find("dt").each(function() {
                    var $dt = $(this)
                    txt = $dt.text()
                    .toLowerCase()
                    .replace(":", "")
                    .replace("published ", "")
                    .trim();
                    $dd = $dt.next();
                    if (txt === "this version") {
                        thisURI = $dd.find('a').attr('href');
                    }
                    else if (/^previous version(?:s)?$/.test(txt))
                    previousURI = $dd.find('a').first().attr('href');
                })
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
        try{
            const content = await genMap[type](url);
            res.send(content);
        } catch (err) {
            res.status(err.status).json({ error: err.message });
        }
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
