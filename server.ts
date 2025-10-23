import { extname, dirname } from "path";
import { fileURLToPath, URL, URLSearchParams } from "url";
import { readFile, unlink, rm, mkdtemp, writeFile, mkdir } from "fs/promises";

import express, { type Response as ExpressResponse } from "express";
import fileUpload from "express-fileupload";
import { fileTypeFromBuffer } from "file-type";
import tar from "tar-stream";
import { load } from "cheerio";

import { generate } from "./generators/respec.js";

const genMap = {
    respec: generate,
};
type GeneratorType = keyof typeof genMap;

function isGeneratorType(type: string): type is GeneratorType {
    return genMap.hasOwnProperty(type);
}

const app = express();

const FORM_HTML = await readFile("index.html", "utf-8");

/** Get present date in YYYY-MM-DD format */
const getShortIsoDate = () => new Date().toISOString().slice(0, 10);

await mkdir("uploads", { recursive: true });
app.use(
    fileUpload({
        createParentPath: true,
        useTempFiles: true,
        tempFileDir: "uploads/",
    }),
);

async function extractTar(tarFile: Buffer<ArrayBufferLike>) {
    const extract = tar.extract();
    const uploadPath = await mkdtemp("uploads/");

    function uploadedFileIsAllowed(name: string) {
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
            stream.on("data", async (data) => {
                if (uploadedFileIsAllowed(header.name)) {
                    if (
                        header.name === "index.html" ||
                        header.name === "./index.html"
                    ) {
                        hasIndex = true;
                    }
                    const filePath = `${uploadPath}/${header.name}`;
                    await mkdir(dirname(filePath), { recursive: true });
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
            typeof req.query.url === "string" ? req.query.url : undefined;
        if (!url || !type) {
            if (
                req.headers.accept &&
                req.headers.accept.includes("text/html")
            ) {
                return res.send(FORM_HTML);
            }
            return res
                .status(400)
                .json({ error: "Both 'type' and 'url' are required." });
        }

        if (!isGeneratorType(type)) {
            return res
                .status(400)
                .json({ error: `Unknown generator: ${type}` });
        }
        const specURL = new URL(url);
        res.locals.targetURL = url;
        res.locals.generatorType = type;
        if (specURL.hostname === "raw.githubusercontent.com") {
            const uploadPath = await mkdtemp("uploads/");
            const originalDocument = await fetch(url);
            const baseRegex =
                /https:\/\/raw.githubusercontent.com\/.+?\/.+?\/.+?\//;
            const basePath = (req.query.url as string).match(baseRegex)![0];
            const $ = load(await originalDocument.text());
            const index = url.replace(/(\?|#).+/, "");
            const links = [index];
            $("[href], [src], [data-include]").each((_, el) => {
                const refUrl =
                    el.attribs.href ||
                    el.attribs.src ||
                    el.attribs["data-include"];
                if (!refUrl) return;
                const u = new URL(
                    refUrl.replace("about:blank", "").replace(/(\?|#).+/, ""),
                    url.replace(/(\?|#).+/, ""),
                );
                if (u.href.startsWith(basePath) && !links.includes(u.href)) {
                    links.push(u.href);
                }
            });

            for (const l of links) {
                const name = l.replace(basePath, "");
                await mkdir(`${uploadPath}/${dirname(name)}`, {
                    recursive: true,
                });
                const response = await fetch(l);
                await writeFile(
                    `${uploadPath}/${name}`,
                    await response.bytes(),
                );
            }

            const baseUrl = `${req.protocol}://${req.get("host")}/`;
            const newPath = url.replace(baseRegex, `${uploadPath}/`);
            res.locals.targetURL = `${baseUrl}${newPath}${specURL.search}`;
            res.locals.tmpDir = uploadPath;
        }
        next();
    },
    async (_, res) => {
        const specURL = new URL(res.locals.targetURL);
        const publishDate =
            specURL.searchParams.get("publishDate") || getShortIsoDate();

        specURL.searchParams.set("publishDate", publishDate);

        // if there's an error we get an err object with status and message, otherwise we get content
        try {
            const { html, errors, warnings } = await genMap[
                res.locals.generatorType as GeneratorType
            ](specURL.href);
            res.setHeader("x-errors-count", errors);
            res.setHeader("x-warnings-count", warnings);
            res.send(html);
        } catch (err) {
            res.status(err.status).json({ error: err.message });
        }
        if (res.locals.tmpDir) {
            rm(res.locals.tmpDir, { recursive: true });
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

async function forwardResponseWithHeaders(
    res: ExpressResponse,
    response: Response,
    headers: string[],
) {
    for (const header of headers) {
        if (response.headers.has(header))
            res.setHeader(header, response.headers.get(header)!);
    }
    res.status(response.status).send(await response.bytes());
}

app.post("/", async (req, res) => {
    const file = req.files?.file;
    if (!file) {
        return res.send({
            status: 400,
            message: "No file uploaded",
        });
    } else if (Array.isArray(file)) {
        return res.send({
            status: 400,
            message:
                "Received multiple files; please upload a tar file instead",
        });
    }

    try {
        const { tempFilePath } = file;

        // file can be an html file or a tar file
        const content = await readFile(tempFilePath);
        const type = await fileTypeFromBuffer(content);
        const path =
            type && type.mime === "application/x-tar"
                ? ((await extractTar(content)) as string)
                : // assume it's an HTML file
                  tempFilePath;

        const generatorType =
            new URLSearchParams(req.body).get("type") || "" + req.query.type;
        if (!generatorType) {
            res.status(400).send("Missing type in POST body or query params");
            return;
        }
        if (!isGeneratorType(generatorType)) {
            res.status(400).send(`Unknown generator: ${type}`);
            return;
        }

        const baseUrl = `${req.protocol}://${req.get("host")}/`;
        const url = new URL(baseUrl);
        url.searchParams.set("url", `${baseUrl}${path}`);
        url.searchParams.set("type", generatorType);
        const response = await fetch(url);

        if (response.status >= 400) {
            forwardResponseWithHeaders(res, response, ["content-type"]);
        } else {
            forwardResponseWithHeaders(res, response, [
                "content-type",
                "x-errors-count",
                "x-warnings-count",
            ]);
            // delete temp file(s)
            unlink(tempFilePath);
            if (tempFilePath !== path) rm(path, { recursive: true });
        }
    } catch (err) {
        res.status(500).send(err);
    }
});

/**
 * Start listening for HTTP requests.
 * @param port - port number to use (optional); defaults to environment variable `$PORT` if exists, and to `8000` if not
 */
export const start = (port = parseInt(process.env.PORT || "", 10) || 8000) => {
    console.log(`spec-generator listening on port ${port}`);
    return app.listen(port);
};

if (process.argv[1] === fileURLToPath(import.meta.url) || process.env.pm_id)
    start();
