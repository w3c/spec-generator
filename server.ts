import type { Server } from "http";
import { mkdir, readFile, unlink } from "fs/promises";
import { extname } from "path";
import { fileURLToPath } from "url";

import express, { type Request, type Response } from "express";
import fileUpload from "express-fileupload";

import { generateBikeshed } from "./generators/bikeshed.js";
import { generateRespec } from "./generators/respec.js";
import { mergeRequestParams } from "./util.js";

const app = express();

await mkdir("uploads", { recursive: true });
app.use(
  fileUpload({
    createParentPath: true,
    useTempFiles: true,
    tempFileDir: "uploads/",
  }),
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

const FORM_HTML = await readFile("index.html", "utf-8");

/**
 * Validates HTTP request parameters.
 * If validation fails, sends response (error or HTML form) and returns null.
 * In other cases, returns an object with information derived from the request,
 * and leaves the response to the consuming function.
 */
function validateParams(req: Request, res: Response) {
  const params = mergeRequestParams(req);
  const type = params.get("type");
  const url = params.get("url");
  const file = req.files?.file;

  if ((!type || !url) && req.method === "GET") {
    if (req.headers.accept?.includes("text/html")) res.send(FORM_HTML);
    else res.status(400).json({ error: "Both 'type' and 'url' are required" });
    return null;
  }

  if (!url && !file) {
    res.status(400).json({ error: "Missing file upload or url" });
    return null;
  }

  if (!type) {
    res.status(400).json({ error: "Missing type" });
    return null;
  }
  if (!isGeneratorType(type)) {
    res.status(400).json({ error: "Invalid type" });
    return null;
  }

  if (Array.isArray(file)) {
    res.status(400).json({
      error: "Received multiple files; please upload a tar file instead",
    });
    return null;
  }

  return { file, params, req, res, type, url };
}
export type ValidateParamsResult = NonNullable<
  ReturnType<typeof validateParams>
>;

const handlers = {
  respec: generateRespec,
  "bikeshed-spec": generateBikeshed,
  "bikeshed-issues-list": generateBikeshed,
};
type GeneratorType = keyof typeof handlers;
const isGeneratorType = (type: string): type is GeneratorType =>
  handlers.hasOwnProperty(type);

app.get("/", async (req, res) => {
  const result = validateParams(req, res);
  if (!result) return;
  await handlers[result.type](result);
});

app.post("/", async (req, res) => {
  const result = validateParams(req, res);
  if (!result) return;
  await handlers[result.type](result);
  if (result.file) await unlink(result.file.tempFilePath).catch(() => {});
});

/**
 * Start listening for HTTP requests.
 * @param port - port number to use (optional); defaults to environment variable `$PORT` if exists, and to `8000` if not
 */
export const start = (port = parseInt(process.env.PORT || "", 10) || 8000) => {
  console.log(`spec-generator listening on port ${port}`);
  return new Promise<Server>((resolve) => {
    const server = app.listen(port, () => resolve(server));
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url) || process.env.pm_id)
  await start();
