import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import type { Server } from "http";

import { start } from "../server.js";

const PORT = 3000;
const BASE_URL = "http://localhost:3000/";
const NO_URL = "?type=foo&URL=notice-that-its-in-uppercase";
const NO_RESPEC = "?type=respec&url=http://example.com/";
const RESPEC_SUCCESS = `?type=respec&url=https://w3c.github.io/spec-generator/respec.html`;
const RESPEC_SUCCESS_RAW = `?type=respec&url=https://raw.githubusercontent.com/w3c/spec-generator/refs/heads/gh-pages/respec.html`;

const expectErrorStatus =
    (
        expectedMessage: string | RegExp = '{"error":"\'url\' is required."}',
        expectedCode = 400,
    ) =>
    async (response: Response) => {
        assert.equal(response.status, expectedCode);
        const responseText = await response.text();
        if (expectedMessage instanceof RegExp)
            assert.match(responseText, expectedMessage);
        else assert.equal(responseText, expectedMessage);
    };

const expectSuccessStatus = async (response: Response) => {
    assert.equal(response.status, 200);
    assert.equal(response.statusText, "OK");
};

const expectNoFailedIncludes = async (response: Response) => {
    assert.doesNotMatch(await response.text(), /Cannot GET \//);
};

const failOnRejection = (error: Error) =>
    assert.fail(`Unexpected fetch promise rejection: ${error}`);

let testServer: Server;

describe("spec-generator: ReSpec", { timeout: 30000 }, () => {
    before(() => {
        testServer = start(PORT);
    });

    describe("fails when it should", () => {
        it("without parameters", async () =>
            fetch(BASE_URL).then(expectErrorStatus(), failOnRejection));
        it("if there's no URL", async () =>
            fetch(BASE_URL + NO_URL).then(
                expectErrorStatus(),
                failOnRejection,
            ));
        it("if the URL does not point to a Respec document", async () =>
            fetch(BASE_URL + NO_RESPEC).then(
                expectErrorStatus(
                    /That doesn't seem to be a ReSpec document. Please check manually:/,
                    500,
                ),
                failOnRejection,
            ));
    });

    describe("succeeds when it should", () => {
        describe("renders form UI", () => {
            it("without parameters", async () =>
                fetch(BASE_URL, {
                    headers: { Accept: "text/html" },
                }).then(expectSuccessStatus, failOnRejection));
            it("if there's no URL", async () =>
                fetch(BASE_URL + NO_URL, {
                    headers: { Accept: "text/html" },
                }).then(expectSuccessStatus, failOnRejection));
        });
        it("Valid ReSpec document, via direct URL", async () =>
            fetch(BASE_URL + RESPEC_SUCCESS).then((response) => {
                expectSuccessStatus(response);
                expectNoFailedIncludes(response);
            }, failOnRejection));
        it("Valid ReSpec document, via raw.githubusercontent", async () =>
            fetch(BASE_URL + RESPEC_SUCCESS_RAW).then((response) => {
                expectSuccessStatus(response);
                expectNoFailedIncludes(response);
            }, failOnRejection));
    });

    after(() => testServer.close());
});
