/// <reference path="./respec.d.ts" />

import { mkdtemp, mkdir, writeFile, rm, readFile } from "fs/promises";
import { dirname } from "path";

import { load } from "cheerio";
import { fileTypeFromBuffer } from "file-type";
import { toHTML } from "respec";
import tar from "tar-stream";

import type { ValidateParamsResult } from "../server.js";
import { getShortIsoDate, mergeParams } from "../util.js";
import { SpecGeneratorError } from "./common.js";

async function invokeRespec(url: URL, params: URLSearchParams) {
  try {
    console.log(`[respec] generating ${url}`);

    const configParams = new URLSearchParams();
    for (const [key, value] of params.entries()) {
      if (key.startsWith("md-") && key !== "md-date" && value)
        configParams.set(key.slice(3), value);
    }

    url.search = mergeParams(
      new URLSearchParams(
        `publishDate=${encodeURIComponent(params.get("md-date") || getShortIsoDate())}`,
      ),
      // Allow respecConfig overrides in general via md-* or GET parameter within url
      configParams,
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

  let hasIndex = false;
  extract.on("entry", (header, stream, next) => {
    stream.on("data", async (data) => {
      if (uploadedFileIsAllowed(header.name)) {
        if (header.name === "index.html" || header.name === "./index.html")
          hasIndex = true;
        const filePath = `${uploadPath}/${header.name}`;
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, data);
      }
    });
    stream.on("end", () => next());
    stream.resume();
  });

  const { promise, resolve, reject } = Promise.withResolvers<string>();
  extract.on("finish", () => {
    if (!hasIndex) reject("No index.html file");
    else resolve(uploadPath);
  });

  extract.end(tarFile);
  return promise;
}

const rawGithubRegex = /https:\/\/raw.githubusercontent.com\/.+?\/.+?\/.+?\//;

async function crawlRaw(url: string) {
  const uploadPath = await mkdtemp("uploads/");
  const response = await fetch(url);
  if (response.status >= 400) {
    throw new SpecGeneratorError({
      message: `${response.status} status received from raw.githubusercontent.com request (check URL?)`,
      status: 400,
    });
  }
  const basePath = url.match(rawGithubRegex)![0];
  const $ = load(await response.text());
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

  return uploadPath;
}

async function resolveUrlOrFile(result: ValidateParamsResult) {
  const { file, req, url } = result;
  if (file) {
    const content = await readFile(file.tempFilePath);
    // file can be an html file or a tar file
    const type = await fileTypeFromBuffer(content);
    const isTar = type && type.mime === "application/x-tar";
    const urlPath = isTar ? await extractTar(content) : file.tempFilePath;

    return {
      // Run ReSpec against static endpoint, as it cannot run against local filesystem
      specUrl: new URL(urlPath, `${req.protocol}://${req.get("host")}`),
      // server.ts will clean up tempFilePath, but needs to be informed of extraction path
      extraPath: isTar ? urlPath : null,
    };
  } else if (url) {
    const specUrl = new URL(url);
    if (specUrl.hostname === "raw.githubusercontent.com") {
      const extraPath = await crawlRaw(url);
      const baseUrl = `${req.protocol}://${req.get("host")}/`;
      const newPath = url.replace(rawGithubRegex, `${extraPath}/`);
      return {
        specUrl: new URL(`${newPath}${specUrl.search}`, baseUrl),
        extraPath,
      };
    } else {
      return { specUrl: new URL(url) };
    }
  }
  throw new Error("[respec] Unexpected result; contained neither file nor url");
}

/** Deletes (in-place) unnecessary fields from ReSpec error/warning entries. */
const trimMessages = (messages: ToHTMLMessage[]) =>
  messages.map((message) => {
    delete message.elements; // Contains empty objects (not serializable?)
    delete message.stack; // Stack trace is long and typically obfuscated
    return message;
  });

/** Generates response for validated respec requests. */
export async function generateRespec(result: ValidateParamsResult) {
  const { params, res } = result;
  const { specUrl, extraPath } = await resolveUrlOrFile(result);

  try {
    const { html, errors, warnings } = await invokeRespec(specUrl, params);
    res.setHeader("x-errors-count", errors.length);
    res.setHeader("x-warnings-count", warnings.length);

    // Mimic respec CLI's haltonerror / haltonwarning behavior
    const dieOn = params.get("die-on");
    const failed =
      (errors.length && dieOn && dieOn !== "nothing") ||
      ((errors.length || warnings.length) && dieOn === "everything");
    if (!failed && params.get("output") !== "messages") {
      res.send(html);
    } else {
      res
        .status(failed ? 422 : 200)
        .json(trimMessages([...errors, ...warnings]));
    }
  } catch (err) {
    res.status(err.status).json({ error: err.message });
  } finally {
    if (extraPath) await rm(extraPath, { recursive: true }).catch(() => {});
  }
}
