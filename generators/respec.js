
var jn = require("path").join
,   u = require("url")
,   querystring = require("querystring")
,   respecWriter = require("respec/tools/respecDocWriter").fetchAndWrite
;

exports.generate = function (url, params, cb) {
    url = u.parse(url);
    // respec use ";" as query string separators
    var qs = querystring.parse(url.query, ";")
    for (var k in params) if (params.hasOwnProperty(k)) qs[k] = params[k];
    url.search = querystring.stringify(qs, ";");
    url = u.format(url);
    console.log("Generating", url);

    respecWriter(url, '/dev/null', {}, 20000).then(function(html) {
        cb(null, html);
    }).catch(function (err) {
        cb({ status: 500, message: err + "\n" + error });
    });
};
