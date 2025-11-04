import { exec, spawn } from "child_process";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import express, { type Request, type Response } from "express";
import filenamify from "filenamify";

import { mergeRequestParams } from "../util.js";
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

const bikeshedTypes = {
    spec: "Spec",
    "issues-list": "Issues list",
} as const;
type BikeshedType = keyof typeof bikeshedTypes;
const isBikeshedType = (type: string | null): type is BikeshedType =>
    !!type && type in bikeshedTypes;

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
    mode: BikeshedType,
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

                const stdout = stdoutChunks
                    .join("")
                    // Correct unfinished JSON in case of fatal error
                    .replace(/,[\n\s]*$/, "]")
                    // Correct for speced/bikeshed#3197
                    .replace(/\n\[/g, "");

                try {
                    const messages = JSON.parse(
                        stdout.trim() || "[]",
                    ) as BikeshedMessage[];
                    for (const { lineNum, messageType, text } of messages) {
                        if (messageType === "fatal") {
                            fatals.push({ lineNum, text });
                        } else if (
                            messageType === "success" ||
                            messageType === "failure"
                        ) {
                            outcomes.push({ lineNum, messageType, text });
                        } else {
                            const key = `${messageType}s`;
                            if (key in result) {
                                result[
                                    key as keyof Omit<BikeshedResult, "html">
                                ].push({
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
                    reject(
                        new SpecGeneratorError(
                            `fatal error: ${fatals[0].text}`,
                        ),
                    );
                } else if (code) {
                    reject(
                        new SpecGeneratorError(
                            `bikeshed process exited with code ${code}`,
                        ),
                    );
                } else {
                    try {
                        result.html = await readFile(outputPath, "utf8");
                        resolve(result);
                    } catch {
                        reject(
                            new SpecGeneratorError(
                                "bikeshed did not write any output",
                            ),
                        );
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
        if (key.startsWith("md-")) metadataOverrides.push(`--${key}=${value}`);
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
    if (!/^https?:\/\//.test(input))
        return invokeBikeshed(input, "issues-list");

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

export const bikeshed = express.Router();

async function invokeBikeshedForRequest(
    input: string,
    req: Request,
    res: Response,
) {
    const params = mergeRequestParams(req);
    const type = params.get("type");
    if (!isBikeshedType(type)) {
        res.status(400).send(`Unknown type: ${type}`);
        return;
    }

    try {
        const { html, ...messages } = await (type === "spec"
            ? generateSpec(input, mergeRequestParams(req))
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

bikeshed.get("/", async (req, res) => {
    const url = typeof req.query.url === "string" ? req.query.url : undefined;
    if (!url || !req.query.type) {
        if (req.headers.accept?.includes("text/html"))
            return res.render("bikeshed", { bikeshedTypes });
        return res
            .status(400)
            .json({ error: "Both 'type' and 'url' are required." });
    }

    await invokeBikeshedForRequest(url, req, res);
});

bikeshed.post("/", async (req, res) => {
    const file = req.files?.file;
    if (Array.isArray(file)) {
        return res.send({
            status: 400,
            message:
                "Received multiple files; please upload a tar file instead",
        });
    }

    const url = mergeRequestParams(req).get("url");
    const input = file?.tempFilePath || url;
    if (!input) {
        return res.send({
            status: 400,
            message: "Missing file upload or url",
        });
    }

    await invokeBikeshedForRequest(input, req, res);
    if (file) await unlink(file.tempFilePath).catch(() => {});
});
