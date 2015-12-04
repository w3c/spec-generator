
var phantom = require("phantomjs")
,   execFile = require("child_process").execFile
,   jn = require("path").join
,   u = require("url")
,   querystring = require("querystring")
,   r2hPath = jn(__dirname, "../node_modules/respec/tools/respec2html.js")
;

exports.generate = function (url, params, cb) {
    url = u.parse(url);
    // respec use ";" as query string separators
    var qs = querystring.parse(url.query, ";")
    for (var k in params) if (params.hasOwnProperty(k)) qs[k] = params[k];
    url.search = querystring.stringify(qs, ";");
    url = u.format(url);
    console.log("Generating", url);
    // Phantom's own timeouts are never reaching us for some reason, so we do our own
    var timedout = false;
    var tickingBomb = setTimeout(
        function () {
            timedout = true;
            cb({ status: 500, message: "Processing timed out." });
        }
    ,   10000
    );
    execFile(
        phantom.path
    ,   ["--ssl-protocol=any", r2hPath, url]
    ,   { maxBuffer: 1600*1024 } // default * 2
    ,   function (err, stdout, stderr) {
            if (timedout) return;
            clearTimeout(tickingBomb);
            if (err) return cb({ status: 500, message: err + "\n" + (stderr || "") });
            cb(null, stdout);
        }
    );
};
