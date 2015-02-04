// heavily copied from https://github.com/tobie/specref/blob/master/scripts/rdf.js
// can be simplified once we get tr.json from W3C

var request = require('request'),
xml2js = require('xml2js');
var current = {};
var RDF_FILE = "http://www.w3.org/2002/01/tr-automation/tr.rdf";
var STATUSES = {
    'NOTE': 'NOTE',
    'REC': 'REC',
    'CR': 'CR',
    'WD': 'WD',
    'LastCall': 'LCWD',
    'PER': 'PER',
    'PR': 'PR'
};
var TR_URLS = {
    "http://www.w3.org/TR/REC-CSS1": "http://www.w3.org/TR/CSS1/",
    "http://www.w3.org/TR/REC-CSS2": "http://www.w3.org/TR/CSS2/",
    "http://www.w3.org/TR/REC-DOM-Level-1": "http://www.w3.org/TR/DOM-Level-1/",
    "http://www.w3.org/TR/REC-DSig-label/": "http://www.w3.org/TR/DSig-label/",
    "http://www.w3.org/TR/REC-MathML": "http://www.w3.org/TR/MathML/",
    "http://www.w3.org/TR/REC-PICS-labels": "http://www.w3.org/TR/PICS-labels/",
    "http://www.w3.org/TR/REC-PICS-services": "http://www.w3.org/TR/PICS-services/",
    "http://www.w3.org/TR/REC-PICSRules": "http://www.w3.org/TR/PICSRules/",
    "http://www.w3.org/TR/REC-WebCGM": "http://www.w3.org/TR/WebCGM/",
    "http://www.w3.org/TR/REC-png": "http://www.w3.org/TR/PNG/",
    "http://www.w3.org/TR/REC-rdf-syntax": "http://www.w3.org/TR/rdf-syntax-grammar/",
    "http://www.w3.org/TR/REC-smil/": "http://www.w3.org/TR/SMIL/",
    "http://www.w3.org/TR/REC-xml-names": "http://www.w3.org/TR/xml-names/",
    "http://www.w3.org/TR/REC-xml": "http://www.w3.org/TR/xml/",
    "http://www.w3.org/TR/xml-events": "http://www.w3.org/TR/xml-events2/",
    "http://www.w3.org/TR/2001/WD-xhtml1-20011004/": "http://www.w3.org/TR/xhtml1/",
};
var ED_DRAFTS = {
    "http://dev.w3.org/2006/webapi/WebIDL/": "http://heycam.github.io/webidl/"
};
var parser = new xml2js.Parser();

function parseTrRdf(callback) {
    request(RDF_FILE, function(err, response, body) {
        if (err || response.statusCode !== 200) {
            callback(err, null)
            return;
        }
        parser.parseString(body, function (err, result) {
            var refs = result['rdf:RDF'];
            var output = [];
            Object.keys(STATUSES).forEach(function(k) {
                if (refs[k]) {
                    var clean = makeCleaner(STATUSES[k]);
                    refs[k].forEach(function(ref) {
                        output.push(clean(ref));
                    });
                }
            });
            var clean;
            if (refs.FirstEdition) {
                clean = makeCleaner(void 0);
                refs.FirstEdition.forEach(function(ref) {
                    output.push(clean(ref));
                });
            }
            if (refs.Retired) {
                clean = makeCleaner(void 0, true);
                refs.Retired.forEach(function(ref) {
                    output.push(clean(ref));
                });
            }
            if (refs.Superseded) {
                clean = makeCleaner(void 0, void 0, true);
                refs.Superseded.forEach(function(ref) {
                    output.push(clean(ref));
                });
            }
            // Fill in missing specs
            output.forEach(function(ref) {
                var k = ref.trURL;
                var curr = current[k];
                if (curr) {
                    for (var prop in ref) {
                        if (typeof ref[prop] !== "undefined") curr[prop] = ref[prop];
                    }
                    curr.href = curr.trURL;
                    delete curr.date;
                    delete curr.trURL;
                    delete curr.shortName;
                } else {
                    var clone = _cloneJSON(ref);
                    clone.href = clone.trURL;
                    delete clone.trURL;
                    delete clone.shortName;
                    current[k] = clone;
                }
            });
            // Fill in missing previous versions
            output.forEach(function(ref) {
                var cur = current[ref.trURL];
                cur.versions = cur.versions || {};
                var key = ref.rawDate.replace(/\-/g, '');
                var prev = cur.versions[key];
                if (prev) {
                    if (prev.aliasOf) {
                        return;
                    }
                    for (var prop in ref) {
                        if (typeof ref[prop] !== "undefined") prev[prop] = ref[prop];
                    }
                    delete prev.date;
                    delete prev.trURL;
                    delete prev.shortName;
                    delete prev.edDraft;
                    delete prev.unorderedAuthors
                } else {
                    var clone = _cloneJSON(ref);
                    delete clone.trURL;
                    delete clone.shortName;
                    delete clone.edDraft;
                    cur.versions[key] = clone;
                }
            });
            callback(null, current);
        });
    });
}

function makeCleaner(status, isRetired, isSuperseded) {
    return function(spec) {
        var authors = walk(spec, "editor");
        authors = authors ? authors.map(function(e) {
            return walk(e, "contact:fullName", 0) || walk(e, "org:name", 0);
        }) : void 0;
        var obj = {
            authors: authors,
            href: walk(spec, "$", "rdf:about"),
            title: walk(spec, "dc:title", 0),
            rawDate: walk(spec, "dc:date", 0),
            status: status,
            publisher: "W3C",
            isRetired: isRetired,
            isSuperseded: isSuperseded,
            trURL: walk(spec, "doc:versionOf", 0, "$", "rdf:resource"),
            edDraft: walk(spec, "ED", 0, "$", "rdf:resource"),
            deliveredBy: walk(spec, "org:deliveredBy"),
            hasErrata: walk(spec, "mat:hasErrata", 0, "$", "rdf:resource"),
            source: RDF_FILE
        };
        obj.deliveredBy = obj.deliveredBy ? obj.deliveredBy.map(function(r) { return walk(r, "contact:homePage", 0, "$", "rdf:resource"); }) : obj.deliveredBy;
        obj.trURL = TR_URLS[obj.trURL] || obj.trURL;
        obj.edDraft = ED_DRAFTS[obj.edDraft] || obj.edDraft;
        return obj;
    }
}
function walk(obj) {
    for (var i=1; i < arguments.length; i++) {
        var prop = arguments[i]
        if (prop in obj) {
            obj = obj[prop];
        } else {
            return void 0;
        }
    }
    return obj;
}
function _cloneJSON(obj) {
    return JSON.parse(JSON.stringify(obj));
}
function isGeneratedByThisScript(ref) {
    return ref.source == "http://www.w3.org/2002/01/tr-automation/tr.rdf" || ref.source == RDF_FILE;
}

exports.previousVersion = function(url, publishDate, callback) {
    parseTrRdf(function(err, trdata) {
        if (err) {
            callback(err, null);
            return;
        }
        var versions = trdata[url].versions || undefined;
        if (!versions) {
            callback("No previous version found for " + url, null);
            return;
        }
        var dates = Object.keys(versions).sort().reverse();
        if (dates[0] && dates[0] !== publishDate.replace('-', '')) {
            callback(null, versions[dates[0]]);
            return;
        }
        // the known latest version is dated of "today",
        // we look at the previous one
        if (dates.length > 1) {
            callback(null, versions[dates[1]]);
            return;
        }
        callback("No previous version found for " + url, null);
    });
}
