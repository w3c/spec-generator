import { exec, spawn } from "child_process";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import filenamify from "filenamify";

import type { ValidateParamsResult } from "../server.js";
import { SpecGeneratorError } from "./common.js";

interface BikeshedMessage {
  lineNum: string | null;
  /** One of the message types enumerated in bikeshed/messages.py */
  messageType:
    | "fatal"
    | "link"
    | "lint"
    | "warning"
    | "message"
    | "success"
    | "failure";
  text: string;
}

interface BikeshedResult {
  html: string;
  messages: BikeshedMessage[];
  count: {
    fatal: number;
    link: number;
    lint: number;
    warning: number;
    message: number;
  };
  success: boolean;
}

const execAsync = promisify(exec);
const bikeshedVersion = await execAsync("bikeshed --version").then(
  ({ stdout }) => stdout.trim(),
  () => null,
);
if (!bikeshedVersion) {
  console.warn("Bikeshed not found! See README.md for setup instructions.");
  console.warn("Bikeshed requests will result in 500 responses.");
}

const generateFilename = (url: string) =>
  join(tmpdir(), `spec-generator-${Date.now()}-${filenamify(url)}.html`);

/**
 * Invokes bikeshed on a URL with the given options.
 * @param input HTTPS URL or file path to process
 * @param modeOptions Additional CLI arguments specified after the mode
 * @param globalOptions Additional CLI arguments specified before the mode
 */
async function invokeBikeshed(
  input: string,
  mode: "spec" | "issues-list",
  modeOptions: string[] = [],
  globalOptions: string[] = [],
) {
  if (!bikeshedVersion) {
    throw new SpecGeneratorError(
      "Bikeshed is currently unavailable on this server.",
    );
  }

  // Bikeshed logs everything to stdout, so stderr is unused.
  // Output HTML to a file to make warnings/errors easier to parse.
  const outputPath = generateFilename(input);

  return new Promise<BikeshedResult>(async (resolve, reject) => {
    // Use spawn instead of exec to make arguments injection-proof
    const bikeshedProcess = spawn(
      "bikeshed",
      [
        "--print=json",
        "--no-update",
        ...globalOptions,
        mode,
        input,
        outputPath,
        ...modeOptions,
      ],
      { timeout: 30000 },
    );
    const pid = bikeshedProcess.pid;
    console.log(`[bikeshed(${pid})] generating ${mode} ${input}`);

    const stdoutChunks: string[] = [];
    bikeshedProcess.stdout.on("data", (data) => stdoutChunks.push(data));
    bikeshedProcess.stderr.on("data", (data) =>
      console.error(`[bikeshed(${pid}) stderr] ${data}`),
    );
    bikeshedProcess.on("error", (error) => {
      console.error(`[bikeshed(${pid}) error]`, error);
      reject(new SpecGeneratorError(error.message));
    });
    bikeshedProcess.on("exit", async (code, signal) => {
      if (signal === "SIGTERM") {
        console.error(`[bikeshed(${pid}) SIGTERM]`);
        reject(
          new SpecGeneratorError(
            "bikeshed process timed out or otherwise terminated",
          ),
        );
      } else {
        const result: BikeshedResult = {
          html: "",
          messages: [],
          success: true,
          count: {
            fatal: 0,
            link: 0,
            lint: 0,
            warning: 0,
            message: 0,
          },
        };

        try {
          result.messages = JSON.parse(
            stdoutChunks.join("").trim() || "[]",
          ) as BikeshedMessage[];
          for (const { messageType } of result.messages) {
            if (messageType === "failure") {
              result.success = false;
            } else if (messageType in result.count) {
              result.count[messageType as keyof typeof result.count]++;
            }
          }
        } catch {
          throw new SpecGeneratorError(
            "Bikeshed returned incomplete or unexpected output",
          );
        }

        if (!result.messages.length && code) {
          reject(
            new SpecGeneratorError(`bikeshed process exited with code ${code}`),
          );
        } else if (result.success) {
          try {
            result.html = await readFile(outputPath, "utf8");
            resolve(result);
          } catch {
            reject(new SpecGeneratorError("bikeshed did not write any output"));
          }
        } else {
          resolve(result);
        }
      }
    });
  }).finally(() => unlink(outputPath).catch(() => {}));
}

/** Runs `bikeshed spec`, incorporating custom metadata. */
const generateSpec = async (input: string, params: URLSearchParams) => {
  const metadataOverrides: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key.startsWith("md-") && value)
      metadataOverrides.push(`--${key}=${value}`);
  }
  return invokeBikeshed(
    input,
    "spec",
    metadataOverrides,
    params.has("die-on") ? [`--die-on=${params.get("die-on")}`] : [],
  );
};

/** Runs `bikeshed issues-list`, fetching from remote server if a URL is specified. */
const generateIssuesList = async (input: string) => {
  if (!/^https?:\/\//.test(input)) return invokeBikeshed(input, "issues-list");

  const filename = generateFilename(input);
  const response = await fetch(input);
  if (response.status >= 400) {
    throw new SpecGeneratorError(
      `URL ${input} responded with ${response.status} status`,
    );
  }

  await writeFile(filename, await response.text());
  return invokeBikeshed(filename, "issues-list").finally(() =>
    unlink(filename).catch(() => {}),
  );
};

/** Generates response for validated bikeshed requests. */
export async function generateBikeshed(result: ValidateParamsResult) {
  const { file, params, res, type, url } = result;

  const input = file?.tempFilePath || url;
  // Return early for type-safety; this should already be handled by server.ts
  if (!input) return;

  try {
    const { html, count, messages, success } = await (type === "bikeshed-spec"
      ? generateSpec(input, params)
      : generateIssuesList(input));
    for (const k of Object.keys(count))
      res.setHeader(`x-${k}s-count`, count[k as keyof typeof count]);

    if (success && params.get("output") !== "messages") res.send(html);
    else res.status(success ? 200 : 422).json(messages);
  } catch (err) {
    res.status(err.status).json({ error: err.message });
  }
}
