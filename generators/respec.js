
var phantom = require("phantomjs")
,   execFile = require("child_process").execFile
,   jn = require("path").join
,   r2hPath = jn(__dirname, "../../node_modules/respec/tools/respec2html.js")
;

exports.generate = function (url, cb) {
    execFile(
        phantom.path
    ,   ["--ssl-protocol=any", r2hPath, url]
    ,   function (err, stdout, stderr) {
            if (err) return cb({ status: 500, message: err + "\n" + stderr });
            cb(null, stdout);
        }
    );
};
