import { extname, dirname } from "path";
import { URL, URLSearchParams } from "url";
import { readFile, unlink, rm, mkdtemp, writeFile } from "fs/promises";
import { readFileSync, mkdirSync, createWriteStream } from "fs";

import express from "express";
import fileUpload from "express-fileupload";
import { fileTypeFromBuffer } from "file-type";
import tar from "tar-stream";
import { JSDOM } from "jsdom";
import request from "request";
import { mkdirp } from "mkdirp";
import fetch from "node-fetch";

import { generate } from "./generators/respec.js";

const genMap = {
    respec: generate,
};

const app = express();
const BASE_URI = process.env.BASE_URI || "";

const FORM_HTML = readFileSync("index.html", "utf-8");

/** Get present date in YYYY-MM-DD format */
const getShortIsoDate = () => new Date().toISOString().slice(0, 10);

app.use(
    fileUpload({
        createParentPath: true,
        useTempFiles: true,
        tempFileDir: "uploads/",
    }),
);

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
                    if (header.name === "index.html" || header.name === "./index.html") {
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
app.get(
    "/",
    async (req, res, next) => {
        const type =
            typeof req.query.type === "string"
                ? req.query.type.toLowerCase()
                : undefined;
        const url =
            typeof req.query.url === "string"
                ? decodeURIComponent(req.query.url)
                : undefined;
        if (!url || !type) {
            if (
                req.headers.accept &&
                req.headers.accept.includes("text/html")
            ) {
                return res.send(FORM_HTML);
            }
            return res
                .status(500)
                .json({ error: "Both 'type' and 'url' are required." });
        }
         
        if (!genMap.hasOwnProperty(req.query.type)) {
            return res
                .status(500)
                .json({ error: `Unknown generator: ${req.query.type}` });
        }
        const specURL = new URL(url);
        req.targetURL = req.query.url;
        if (specURL.hostname === "raw.githubusercontent.com") {
            const uploadPath = await mkdtemp("uploads/");
            const originalDocument = await fetch(url);
            const baseRegex =
                /https:\/\/raw.githubusercontent.com\/.+?\/.+?\/.+?\//;
            const basePath = req.query.url.match(baseRegex)[0];
            const jsdom = new JSDOM(await originalDocument.text());
            const refs =
                jsdom.window.document.querySelectorAll("[href], [src]");
            const index = url.replace(/(\?|#).+/, "");
            const links = [index];
            refs.forEach(ref => {
                if (ref && (ref.href || ref.src)) {
                    const u = new URL(
                        (ref.href || ref.src)
                            .replace("about:blank", "")
                            .replace(/(\?|#).+/, ""),
                        url.replace(/(\?|#).+/, ""),
                    );
                    if (
                        u.href.startsWith(basePath) &&
                        !links.includes(u.href)
                    ) {
                        links.push(u.href);
                    }
                }
            });

            links.forEach(async l => {
                const name = l.replace(basePath, "");
                mkdirSync(`${uploadPath}/${dirname(name)}`, {
                    recursive: true,
                });
                const response = await fetch(l);
                response.body.pipe(createWriteStream(`${uploadPath}/${name}`));
            });

            const baseUrl = `${req.protocol}://${req.get("host")}/`;
            const newPath = url.replace(baseRegex, `${uploadPath}/`);
            req.targetURL = `${baseUrl}${newPath}${specURL.search}`;
            req.tmpDir = uploadPath;
        }
        next();
    },
    async (req, res) => {
        const specURL = new URL(req.targetURL);
        const publishDate =
            specURL.searchParams.get("publishDate") || getShortIsoDate();

        specURL.searchParams.set("publishDate", publishDate);

        // if there's an error we get an err object with status and message, otherwise we get content
        try {
            const { html, errors, warnings } = await genMap[req.query.type](
                specURL.href,
            );
            res.setHeader("x-errors-count", errors);
            res.setHeader("x-warnings-count", warnings);
            res.send(html);
        } catch (err) {
            res.status(err.status).json({ error: err.message });
        }
        if (req.tmpDir) {
            rm(req.tmpDir, { recursive: true });
        }
    },
);

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
        const type = await fileTypeFromBuffer(content);
        const path =
            type && type.mime === "application/x-tar"
                ? await extractTar(content)
                : // assume it's an HTML file
                  tempFilePath;

        const baseUrl = `${req.protocol}://${req.get("host")}/`;
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
                rm(path, { recursive: true });
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
app.start = (port = parseInt(process.env.PORT, 10) || 8000) => app.listen(port);

const server = app.start();
export default app;
export { server };
