
var express = require("express")
,   w3cmetadata = require("./lib/w3c-metadata")
,   urlparser = require("url")
,   querystring = require("querystring")
,   app = express()
,   genMap = {
        respec: require("./generators/respec").generate
    }
,   num2 = function (num) {
        var str = num + "";
        if (str.length >= 2) return str;
        return "0" + str;
    }
;

// Listens to GET at the root, expects two required query string parameters:
//  type:   the type of the generator (case-insensitive)
//  url:    the URL to the source document
app.get("/", function (req, res) {
    var type = (req.query.type || "").toLowerCase()
    ,   url = req.query.url
    ,   params = {}
    ,   shortName
    ;
    if (!url || !type) return res.status(500).json({ error: "Both 'type' and 'url' are required." });
    if (!genMap[type]) return res.status(500).json({ error: "Unknown generator: " + type });

    // We look if the provided URL comes with a shortName in the query string
    var urlComponents = urlparser.parse(url);
    var qs = querystring.parse(urlComponents.query, ';')
    shortName = qs.shortName;

    if (req.query.publishDate) params.publishDate = req.query.publishDate;
    else {
        var d = new Date();
        params.publishDate = [d.getFullYear(), num2(d.getMonth() + 1), num2(d.getDay())].join("-");
    }

    // if shortName was provided, we collect info on previous version
    if (shortName) {
        w3cmetadata.previousVersion("http://www.w3.org/TR/"
                                    + shortName + "/",
                                    params.publishDate,
                                    function(err, prev) {
                                        if (err) return res.status(400).json({error: err});
                                        params.previousMaturity = prev.status;
                                        params.previousPublishDate = prev.rawDate;

                                        generate();
                                    });
    } else {
        generate();
    }

    function generate() {
        // if there's an error we get an err object with status and message, otherwise we get content
        genMap[type](url, params, function (err, content) {
            if (err) return res.status(err.status).json({ error: err.message });
            res.send(content);
        });
    }
});
app.listen(process.env.PORT || 80);
