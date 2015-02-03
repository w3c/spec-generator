
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
;

// Listens to GET at the root, expects two required query string parameters:
//  type:   the type of the generator (case-insensitive)
//  url:    the URL to the source document
app.get("/", function (req, res) {
    var type = (req.query.type || "").toLowerCase()
    ,   url = req.query.url
    ,   params = {}
    ,   acceptedConfig = "shortName previousPublishDate previousMaturity".split(" ")
    ;
    if (!url || !type) return res.status(500).json({ error: "Both 'type' and 'url' are required." });
    if (!genMap[type]) return res.status(500).json({ error: "Unknown generator: " + type });

    // we need to sanitise the data we're getting (otherwise one could maliciously override some
    // pretty powerful configuration options)
    for (var i = 0, n = acceptedConfig.length; i < n; i++) {
        var field = acceptedConfig[i];
        if (req.query[field]) params[field] = req.query[field];
    }
    if (req.query.publishDate) params.publishDate = req.query.publishDate;
    else {
        var d = new Date();
        params.publishDate = [d.getFullYear(), num2(d.getMonth() + 1), num2(d.getDay())].join("-");
    }

    // if there's an error we get an err object with status and message, otherwise we get content
    genMap[type](url, params, function (err, content) {
        if (err) return res.status(err.status).json({ error: err.message });
        res.send(content);
    });
});
app.listen(process.env.PORT || 80);
