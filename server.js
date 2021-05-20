const { extname, dirname } = require("path");
const { URL, URLSearchParams } = require("url");
const { readFile, unlink, rmdir, mkdtemp, writeFile } = require("fs").promises;
const { readFileSync } = require("fs");

const express = require("express");
const fileUpload = require("express-fileupload");
const fileType = require("file-type");
const tar = require("tar-stream");
const { JSDOM } = require("jsdom");
const request = require("request");
const mkdirp = require("mkdirp");

const respec = require("./generators/respec").generate;

const genMap = {
    respec,
};

const app = express();
const BASE_URI = process.env.BASE_URI || "";

const FORM_HTML = readFileSync(`${__dirname}/index.html`, "utf-8");

/** Get present date in YYYY-MM-DD format */
const getShortIsoDate = () => new Date().toISOString().slice(0, 10);

app.use(
    fileUpload({
        createParentPath: true,
        useTempFiles: true,
        tempFileDir: "uploads/",
    }),
);

/**
 * @param {string} shortName
 * @param {string} publishDate
 * @returns {Promise<{ previousMaturity: string, previousPublishDate: string }>}
 * @throws {Promise<{ statusCode: number, error: string }>}
 */
function getPreviousVersionInfo(shortName, publishDate) {
    return new Promise((resolve, reject) => {
        const url = `https://www.w3.org/TR/${shortName}/`;
        request.get(url, (error, response, body) => {
            if (error) {
                // eslint-disable-next-line prefer-promise-reject-errors
                return reject({ statusCode: 400, error });
            }

            if (
                response &&
                response.statusCode >= 400 &&
                response.statusCode < 500
            ) {
                const { statusCode, statusMessage } = response;
                // eslint-disable-next-line prefer-promise-reject-errors
                return reject({ statusCode, error: statusMessage });
            }

            const { document } = new JSDOM(body).window;
            const dl = document.querySelector("body div.head dl");

            let thisURI;
            let previousURI;
            if (dl) {
                // eslint-disable-next-line no-restricted-syntax
                for (const dt of dl.querySelectorAll("dt")) {
                    const txt = dt.textContent
                        .toLocaleLowerCase()
                        .replace(":", "")
                        .replace("published", "")
                        .trim();
                    const dd = dt.nextElementSibling;
                    if (txt === "this version") {
                        thisURI = dd.querySelector("a").href;
                    } else if (/^previous version(?:s)?$/.test(txt)) {
                        previousURI = dd.querySelector("a").href;
                    }
                }
            }
            if (!thisURI) {
                // eslint-disable-next-line prefer-promise-reject-errors
                return reject({
                    statusCode: 5000,
                    error: `Couldn't find a 'This version' uri in the previous version.`,
                });
            }

            const thisDate = thisURI.match(/[1-2][0-9]{7}/)[0];
            const prev =
                thisDate === publishDate.replace(/-/g, "")
                    ? previousURI
                    : thisURI;
            const pDate = prev.match(/[1-2][0-9]{7}/)[0];

            const previousMaturity = prev.match(/\/TR\/[0-9]{4}\/([A-Z]+)/)[1];
            const previousPublishDate = pDate.replace(
                /(\d{4})(\d{2})(\d{2})/,
                "$1-$2-$3",
            );
            resolve({ previousMaturity, previousPublishDate });
        });
    });
}

async function extractTar(tarFile) {
    const extract = tar.extract();
    const uploadPath = await mkdtemp("uploads/");

    function uploadedFileIsAllowed(name) {
        if (name.toLowerCase().includes(".htaccess")) return false;
        if (name.toLowerCase().includes(".php")) return false;
        if (name.includes("CVS")) return false;
        if (name.includes("../")) return false;
        if (name.includes("://")) return false;
        return true;
    }

    return new Promise((resolve, reject) => {
        let hasIndex = false;
        extract.on("entry", (header, stream, next) => {
            stream.on("data", async data => {
                if (uploadedFileIsAllowed(header.name)) {
                    if (!hasIndex && header.name === "index.html") {
                        hasIndex = true;
                    }
                    const filePath = `${uploadPath}/${header.name}`;
                    mkdirp.sync(dirname(filePath));
                    await writeFile(filePath, data);
                }
            });
            stream.on("end", () => next());
            stream.resume();
        });

        extract.on("finish", () => {
            if (!hasIndex) {
                // eslint-disable-next-line prefer-promise-reject-errors
                reject("No index.html file");
            } else {
                resolve(uploadPath);
            }
        });

        extract.end(tarFile);
    });
}

// Listens to GET at the root, expects two required query string parameters:
//  type:   the type of the generator (case-insensitive)
//  url:    the URL to the source document
app.get("/", async (req, res) => {
    const type =
        typeof req.query.type === "string"
            ? req.query.type.toLowerCase()
            : undefined;
    const url =
        typeof req.query.url === "string"
            ? decodeURIComponent(req.query.url)
            : undefined;
    if (!url || !type) {
        if (req.headers.accept && req.headers.accept.includes("text/html")) {
            return res.send(FORM_HTML);
        }
        return res
            .status(500)
            .json({ error: "Both 'type' and 'url' are required." });
    }
    // eslint-disable-next-line no-prototype-builtins
    if (!genMap.hasOwnProperty(type)) {
        return res.status(500).json({ error: `Unknown generator: ${type}` });
    }

    const specURL = new URL(url);
    if (specURL.hostname === "raw.githubusercontent.com") {
        return res.status(500).json({
            error: `raw.githubusercontent.com URLs aren't supported. Use github pages instead.`,
        });
    }
    const shortName = specURL.searchParams.get("shortName");
    const publishDate =
        specURL.searchParams.get("publishDate") || getShortIsoDate();

    specURL.searchParams.set("publishDate", publishDate);

    if (shortName) {
        try {
            const { previousMaturity, previousPublishDate } =
                await getPreviousVersionInfo(shortName, publishDate);
            specURL.searchParams.set("previousMaturity", previousMaturity);
            specURL.searchParams.set(
                "previousPublishDate",
                previousPublishDate,
            );
        } catch ({ statusCode, error }) {
            return res.status(statusCode).json({ error });
        }
    }

    // if there's an error we get an err object with status and message, otherwise we get content
    try {
        const { html, errors, warnings } = await genMap[type](specURL.href);
        res.setHeader("x-errors-count", errors);
        res.setHeader("x-warnings-count", warnings);
        res.send(html);
    } catch (err) {
        res.status(err.status).json({ error: err.message });
    }
});

app.use(
    "/uploads",
    express.static("./uploads", {
        setHeaders(res, requestPath) {
            const noExtension = !extname(requestPath);
            if (noExtension) res.setHeader("Content-Type", "text/html");
        },
    }),
);

app.post("/", async (req, res) => {
    if (!req.files || !req.files.file) {
        return res.send({
            status: 500,
            message: "No file uploaded",
        });
    }

    try {
        const { tempFilePath } = req.files.file;

        // file can be an html file or a tar file
        const content = await readFile(tempFilePath);
        const type = await fileType.fromBuffer(content);
        const path =
            type && type.mime === "application/x-tar"
                ? await extractTar(content)
                : // assume it's an HTML file
                  tempFilePath;

        const baseUrl = `${req.protocol}://${req.get("host")}/${BASE_URI}`;
        const params = new URLSearchParams(req.body).toString();
        const src = `${baseUrl}${path}?${params}`;
        const qs = { url: src, type: "respec" };
        request.get({ url: baseUrl, qs }, (err, response, body) => {
            if (err) {
                res.status(500).send(err);
            } else {
                res.setHeader(
                    "x-errors-count",
                    response.headers["x-errors-count"],
                );
                res.setHeader(
                    "x-warnings-count",
                    response.headers["x-warnings-count"],
                );
                res.send(body);
                // delete temp file
                unlink(tempFilePath);
                rmdir(path, { recursive: true });
            }
        });
    } catch (err) {
        res.status(500).send(err);
    }
});

/**
 * Start listening for HTTP requests.
 * @param {number} [port] - port number to use (optional); defaults to environment variable `$PORT` if exists, and to `80` if not
 */
app.start = (port = parseInt(process.env.PORT, 10) || 80) => app.listen(port);

module.exports = app;
if (module === require.main) {
    app.start();
}
