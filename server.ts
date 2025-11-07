import { extname } from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";

import express from "express";
import fileUpload from "express-fileupload";

import { Liquid } from "liquidjs";
import { respec } from "./generators/respec.js";
import { bikeshed } from "./generators/bikeshed.js";

const app = express();
app.engine(
  "html",
  new Liquid({
    root: import.meta.dirname,
    jekyllInclude: true,
  }).express(),
);
app.set("view engine", "html");
app.set("views", ["./partials", "./views"]);

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

app.use("/", respec);
app.use("/bikeshed", bikeshed);

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
