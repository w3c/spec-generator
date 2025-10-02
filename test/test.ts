import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import type { Server } from "http";

import { start } from "../server.js";

const PORT = 3000;
const BASE_URL = "http://localhost:3000/";
const NO_URL = "?type=foo&URL=notice-that-its-in-uppercase";
const NO_TYPE = "?url=foo&TYPE=notice-that-its-in-uppercase";
const BAD_GENERATOR = "?type=fluxor&url=http://example.com/";
const NO_RESPEC = "?type=respec&url=http://example.com/";
const SUCCESS1 = `?type=respec&url=https://w3c.github.io/manifest/`;
const SUCCESS2 = `?type=respec&url=https://w3c.github.io/payment-request/`;
const SUCCESS3 = `?type=respec&url=https://w3c.github.io/vc-di-ecdsa/`;

const expectErrorStatus =
    (
        expectedMessage:
            | string
            | RegExp = "{\"error\":\"Both 'type' and 'url' are required.\"}",
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

const failOnRejection = (error: Error) =>
    assert.fail(`Unexpected fetch promise rejection: ${error}`);

let testServer: Server;

describe("spec-generator", { timeout: 30000 }, () => {
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
        it("if there's no type", async () =>
            fetch(BASE_URL + NO_TYPE).then(
                expectErrorStatus(),
                failOnRejection,
            ));
        it("if the generator is not valid", async () =>
            fetch(BASE_URL + BAD_GENERATOR).then(
                expectErrorStatus('{"error":"Unknown generator: fluxor"}'),
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
            it("if there's no type", async () =>
                fetch(BASE_URL + NO_TYPE, {
                    headers: { Accept: "text/html" },
                }).then(expectSuccessStatus, failOnRejection));
        });
        it('Web App Manifest ("appmanifest")', async () =>
            fetch(BASE_URL + SUCCESS1).then(
                expectSuccessStatus,
                failOnRejection,
            ));
        it('Payment Request API ("payment-request")', async () =>
            fetch(BASE_URL + SUCCESS2).then(
                expectSuccessStatus,
                failOnRejection,
            ));
        it('Resource Hints ("vc-di-ecdsa")', async () =>
            fetch(BASE_URL + SUCCESS3).then(
                expectSuccessStatus,
                failOnRejection,
            ));
    });

    after(() => testServer.close());
});
