/// <reference path="./respec.d.ts" />

import { mkdtemp, mkdir, writeFile, rm, readFile, unlink } from "fs/promises";
import { dirname } from "path";

import { load } from "cheerio";
import express, { type Response as ExpressResponse } from "express";
import { fileTypeFromBuffer } from "file-type";
import { toHTML } from "respec";
import tar from "tar-stream";

import { getShortIsoDate, appendParams, mergeRequestParams } from "../util.js";
import { SpecGeneratorError } from "./common.js";

async function generateRespec(url: URL, params: URLSearchParams) {
  try {
    console.log(`[respec] generating ${url}`);
    url.search = appendParams(
      // Establish today's date as default, then allow override via
      // direct GET/POST param, or GET param nested within ReSpec URL
      new URLSearchParams(`publishDate=${getShortIsoDate()}`),
      params,
      url.searchParams,
    ).toString();
    const { html, errors, warnings } = await toHTML(url.href, {
      timeout: 30000,
      disableSandbox: true,
      disableGPU: true,
    });
    return { html, errors, warnings };
  } catch (err) {
    throw new SpecGeneratorError(err.message);
  }
}

function uploadedFileIsAllowed(name: string) {
  if (name.toLowerCase().includes(".htaccess")) return false;
  if (name.toLowerCase().includes(".php")) return false;
  if (name.includes("CVS")) return false;
  if (name.includes("../")) return false;
  if (name.includes("://")) return false;
  return true;
}

async function extractTar(tarFile: Buffer<ArrayBufferLike>) {
  const extract = tar.extract();
  const uploadPath = await mkdtemp("uploads/");

  return new Promise((resolve, reject) => {
    let hasIndex = false;
    extract.on("entry", (header, stream, next) => {
      stream.on("data", async (data) => {
        if (uploadedFileIsAllowed(header.name)) {
          if (header.name === "index.html" || header.name === "./index.html") {
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

export const respec = express.Router();

// Listens to GET; expects one required query string parameter:
//  url:    the URL to the source document
respec.get(
  "/",
  async (req, res, next) => {
    const url = typeof req.query.url === "string" ? req.query.url : undefined;
    if (!url) {
      if (req.headers.accept?.includes("text/html"))
        return res.render("respec");
      return res.status(400).json({ error: "'url' is required." });
    }

    const specURL = new URL(url);
    if (specURL.hostname === "raw.githubusercontent.com") {
      const uploadPath = await mkdtemp("uploads/");
      const originalDocument = await fetch(url);
      const baseRegex = /https:\/\/raw.githubusercontent.com\/.+?\/.+?\/.+?\//;
      const basePath = (req.query.url as string).match(baseRegex)![0];
      const $ = load(await originalDocument.text());
      const index = url.replace(/(\?|#).+/, "");
      const links = [index];
      $("[href], [src], [data-include]").each((_, el) => {
        const refUrl =
          el.attribs.href || el.attribs.src || el.attribs["data-include"];
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
        await writeFile(`${uploadPath}/${name}`, await response.bytes());
      }

      const baseUrl = `${req.protocol}://${req.get("host")}/`;
      const newPath = url.replace(baseRegex, `${uploadPath}/`);
      res.locals.targetURL = `${baseUrl}${newPath}${specURL.search}`;
      res.locals.tmpDir = uploadPath;
    } else {
      res.locals.targetURL = url;
    }
    next();
  },
  async (req, res) => {
    // if there's an error we get an err object with status and message, otherwise we get content
    try {
      const { html, errors, warnings } = await generateRespec(
        new URL(res.locals.targetURL),
        mergeRequestParams(req),
      );
      res.setHeader("x-errors-count", errors.length);
      res.setHeader("x-warnings-count", warnings.length);
      res.send(html);
    } catch (err) {
      res.status(err.status).json({ error: err.message });
    }
    if (res.locals.tmpDir)
      await rm(res.locals.tmpDir, { recursive: true }).catch(() => {});
  },
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

respec.post("/", async (req, res) => {
  const file = req.files?.file;
  if (!file) {
    return res.send({
      status: 400,
      message: "No file uploaded",
    });
  } else if (Array.isArray(file)) {
    return res.send({
      status: 400,
      message: "Received multiple files; please upload a tar file instead",
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

    // Run ReSpec against static endpoint, as it cannot run against local filesystem
    const baseUrl = `${req.protocol}://${req.get("host")}/`;
    const url = new URL(baseUrl);
    const params = mergeRequestParams(req);
    params.set("url", `${baseUrl}${path}`);
    url.search = params.toString();
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
      await unlink(tempFilePath).catch(() => {});
      if (tempFilePath !== path)
        await rm(path, { recursive: true }).catch(() => {});
    }
  } catch (err) {
    res.status(500).send(err);
  }
});
