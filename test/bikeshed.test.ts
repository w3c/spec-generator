import { after, before, describe, it } from "node:test";
import type { Server } from "http";

import { start } from "../server.js";
import {
  createErrorStatusTestCallback,
  createFetchHelpers,
  expectSuccessStatus,
  failOnRejection,
} from "./test-util.js";

const PORT = 3000;
// Sensor Use Cases at the specified commit emits warning messages,
// and contains non-HTTPS W3C URLs.
const URL_SPEC =
  "https://raw.githubusercontent.com/w3c/sensors/d8b0f67c/usecases.bs";
const URL_ISSUES_LIST =
  "https://raw.githubusercontent.com/w3c/process/562cddb8/issues-20210603.txt";

const { get, post, testAll } = createFetchHelpers(
  `http://localhost:${PORT}/bikeshed/`,
);

let testServer: Server;

const specFailurePattern =
  /^{"error":"failure: Did not generate, due to errors exceeding the allowed error level."}$/;
const issuesFailurePattern =
  /^\{"error":"fatal error: Missing 'Draft' metadata."\}$/;

describe("spec-generator: Bikeshed", { timeout: 30000 }, () => {
  before(() => {
    testServer = start(PORT);
  });

  describe("fails when it should", () => {
    it("without parameters (GET)", () =>
      get({}).then(
        createErrorStatusTestCallback(
          /^{"error":"Both 'type' and 'url' are required."}$/,
        ),
        failOnRejection,
      ));
    it("without parameters (POST)", () =>
      post({}).then(
        createErrorStatusTestCallback(
          /^{"error":"Missing file upload or url"}$/,
        ),
        failOnRejection,
      ));

    testAll("spec mode with a non-spec URL", (request) =>
      request({ type: "spec", url: URL_ISSUES_LIST }).then(
        createErrorStatusTestCallback(specFailurePattern, 500),
        failOnRejection,
      ),
    );

    testAll("issues-list mode with a non-issues-list URL", (request) =>
      request({ type: "issues-list", url: URL_SPEC }).then(
        createErrorStatusTestCallback(issuesFailurePattern, 500),
        failOnRejection,
      ),
    );

    testAll(
      "when die-on is set and the build produces a message at/above that level",
      (request) =>
        request({
          type: "spec",
          url: URL_SPEC,
          "die-on": "warning",
        }).then(
          createErrorStatusTestCallback(specFailurePattern, 500),
          failOnRejection,
        ),
    );
  });

  describe("succeeds when it should", () => {
    it("renders form UI upon GET w/ Accept: text/html and no params", () =>
      get({}, { headers: { Accept: "text/html" } }).then(
        expectSuccessStatus,
        failOnRejection,
      ));

    testAll("renders spec, via raw.githubusercontent URL", (request) =>
      request({ type: "spec", url: URL_SPEC }).then(
        expectSuccessStatus,
        failOnRejection,
      ),
    );

    testAll("renders spec with date overridden", (request) =>
      request({
        type: "spec",
        url: URL_SPEC,
        "md-date": "2025-11-01",
      }).then(
        (response) =>
          expectSuccessStatus(
            response,
            /<time class="dt-updated" datetime="2025-11-01">1 November 2025</,
          ),
        failOnRejection,
      ),
    );

    testAll(
      "renders spec with adjustments when Prepare for TR is set",
      (request) =>
        request({
          type: "spec",
          url: URL_SPEC,
          "md-prepare-for-tr": "yes",
        }).then(
          (response) =>
            expectSuccessStatus(
              response,
              /https:\/\/www.w3.org\/TR\/generic-sensor-usecases/,
            ),
          failOnRejection,
        ),
    );

    testAll("renders issues list", (request) =>
      request({
        type: "issues-list",
        url: URL_ISSUES_LIST,
      }).then(expectSuccessStatus),
    );
  });

  after(() => testServer.close());
});
