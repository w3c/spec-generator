
var phantom = require("phantomjs")
,   spawn = require("child_process").spawn
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
    ,   12000
    );
    var childProcess = spawn(
        phantom.path
    ,   ["--ssl-protocol=any", r2hPath, url]
    ,   { detached: true }
    );

    var invokedCallBack = false;
    var content = "";
    var error = "";
    childProcess.stdout.setEncoding("utf-8");
    childProcess.stdout.on('data', function (chunk) {
        content += chunk;
    });
    childProcess.stderr.on('data', function (chunk) {
        error += chunk;
    });
    childProcess.on("error",   function (err) {
        if (timedout || invokedCallBack) return;
        invokedCallBack = true;
        clearTimeout(tickingBomb);
        cb({ status: 500, message: err + "\n" + error });
    });
    childProcess.on("close",   function () {
        if (timedout || invokedCallBack) return;
        invokedCallBack = true;
        clearTimeout(tickingBomb);
        cb(null, content);
    });
};
