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
type BikeshedResultMessage = Omit<BikeshedMessage, "messageType">;

interface BikeshedResult {
  html: string;
  links: BikeshedResultMessage[];
  lints: BikeshedResultMessage[];
  warnings: BikeshedResultMessage[];
  messages: BikeshedResultMessage[];
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
          links: [],
          lints: [],
          warnings: [],
          messages: [],
        };
        const fatals: BikeshedResultMessage[] = [];
        const outcomes: BikeshedMessage[] = [];

        const stdout = stdoutChunks.join("");

        try {
          const messages = JSON.parse(
            stdout.trim() || "[]",
          ) as BikeshedMessage[];
          for (const { lineNum, messageType, text } of messages) {
            if (messageType === "fatal") {
              fatals.push({ lineNum, text });
            } else if (messageType === "success" || messageType === "failure") {
              outcomes.push({ lineNum, messageType, text });
            } else {
              const key = `${messageType}s`;
              if (key in result) {
                result[key as keyof Omit<BikeshedResult, "html">].push({
                  lineNum,
                  text,
                });
              }
            }
          }
        } catch {
          fatals.push({
            lineNum: null,
            text: "Bikeshed returned incomplete or unexpected output",
          });
        }

        // If bikeshed fails, report the most useful message we can find
        const failure = outcomes.find(
          ({ messageType }) => messageType === "failure",
        );
        if (failure) {
          reject(new SpecGeneratorError(`failure: ${failure.text}`));
        } else if (fatals.length > 0) {
          reject(new SpecGeneratorError(`fatal error: ${fatals[0].text}`));
        } else if (code) {
          reject(
            new SpecGeneratorError(`bikeshed process exited with code ${code}`),
          );
        } else {
          try {
            result.html = await readFile(outputPath, "utf8");
            resolve(result);
          } catch {
            reject(new SpecGeneratorError("bikeshed did not write any output"));
          }
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
    const { html, ...messages } = await (type === "bikeshed-spec"
      ? generateSpec(input, params)
      : generateIssuesList(input));
    for (const k of Object.keys(messages)) {
      res.setHeader(
        `x-${k}-count`,
        messages[k as keyof typeof messages].length,
      );
    }
    res.send(html);
  } catch (err) {
    res.status(err.status).json({ error: err.message });
  }
}
