import type { Server } from "http";
import { after, before, describe, it } from "node:test";

import { start } from "../server.js";
import {
  createErrorStatusTestCallback,
  expectSuccessStatus,
  failOnRejection,
  TEST_PORT,
  testFetchHelpers,
} from "./test-util.js";

const { get, post } = testFetchHelpers;

describe("spec-generator", async () => {
  let testServer: Server;

  before(async () => {
    testServer = await start(TEST_PORT);
  });

  after(() => testServer.close());

  describe("General", () => {
    describe("fails when it should", () => {
      it("without any parameters (GET)", () =>
        get({}).then(
          createErrorStatusTestCallback(
            /^{"error":"Both 'type' and 'url' are required"}$/,
          ),
          failOnRejection,
        ));

      it("without any parameters (POST)", () =>
        post({}).then(
          createErrorStatusTestCallback(
            /^{"error":"Missing file upload or url"}$/,
          ),
          failOnRejection,
        ));

      it("without type parameter (POST)", () =>
        post({ url: "https://w3c.github.io/wcag/" }).then(
          createErrorStatusTestCallback(/^{"error":"Missing type"}$/),
          failOnRejection,
        ));
    });

    describe("succeeds when it should", () => {
      it("renders form UI upon GET w/ Accept: text/html and no params", () =>
        get({}, { headers: { Accept: "text/html" } }).then(
          expectSuccessStatus,
          failOnRejection,
        ));
    });
  });

  // Run tests for each generator type
  await import("./bikeshed.test.js");
  await import("./respec.test.js");
});
