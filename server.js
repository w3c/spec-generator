
var express = require("express")
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
,   request = require("request")
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
        params.publishDate = [d.getFullYear(), num2(d.getMonth() + 1), num2(d.getDate())].join("-");
    }

    // if shortName was provided, we collect info on previous version
    if (shortName) {
     request.get("http://www.w3.org/TR/" + shortName + "/", function(error, response, body) {
       if (error) return res.status(400).json({error: err});
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
                        .replace("published ", "");
               $dd = $dt.next();
           if (txt === "this version") {
             thisURI = $dd.find('a').attr('href');
           }
           else if (/^previous version(?:s)?$/.test(txt))
             previousURI = $dd.find('a').first().attr('href');
         })
       }
       var thisDate = thisURI.match(/[1-2][0-9]{7}/)[0]
       ,   prev     = (thisDate === params.publishDate.replace(/\-/g, '')) ? previousURI : thisURI
       ,   pDate    = prev.match(/[1-2][0-9]{7}/)[0];
       params.previousMaturity = prev.match(/\/TR\/[0-9]{4}\/([A-Z]+)/)[1];
       params.previousPublishDate = pDate.substring(0, 4) + '-' +
         pDate.substring(4, 6) + '-' + pDate.substring(6, 8);
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
