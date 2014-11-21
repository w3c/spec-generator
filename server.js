
var express = require("express")
,   app = express()
,   genMap = {
        respec: require("./generators/respec").generate
    }
;

// Listens to GET at the root, expects two required query string parameters:
//  type:   the type of the generator (case-insensitive)
//  url:    the URL to the source document
app.get("/", function (req, res) {
    var type = (req.query.type || "").toLowerCase()
    ,   url = req.query.url
    ;
    if (!url || !type) return res.status(500).json({ error: "Both 'type' and 'url' are required." });
    if (!genMap[type]) return res.status(500).json({ error: "Unknown generator: " + type });
    // if there's an error we get an err object with status and message, otherwise we get content
    genMap[type](url, function (err, content) {
        if (err) return res.status(err.status).json({ error: err.message });
        res.send(content);
    });
});
app.listen(process.env.PORT || 80);
