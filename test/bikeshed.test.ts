import { describe, it } from "node:test";

import {
  createErrorStatusTestCallback,
  expectSuccessStatus,
  failOnRejection,
  testFetchHelpers,
} from "./test-util.js";

// Sensor Use Cases at the specified commit emits warning messages,
// and contains non-HTTPS W3C URLs.
const URL_SPEC =
  "https://raw.githubusercontent.com/w3c/sensors/d8b0f67c/usecases.bs";
const URL_SPEC_FATAL =
  "https://raw.githubusercontent.com/WICG/background-sync/04f129e5/spec/index.bs";
const URL_ISSUES_LIST =
  "https://raw.githubusercontent.com/w3c/process/562cddb8/issues-20210603.txt";

const { get, post, testAll } = testFetchHelpers;

const failurePattern =
  /"messageType":"failure","text":"Did not generate, due to errors exceeding the allowed error level."/;

describe("Bikeshed", () => {
  describe("fails when it should", { timeout: 10000 }, () => {
    it("without url or file parameter (GET)", () =>
      get({ type: "bikeshed-spec" }).then(
        createErrorStatusTestCallback(
          /^{"error":"Both 'type' and 'url' are required"}$/,
        ),
        failOnRejection,
      ));

    it("without url or file parameter (POST)", () =>
      post({ type: "bikeshed-spec" }).then(
        createErrorStatusTestCallback(
          /^{"error":"Missing file upload or url"}$/,
        ),
        failOnRejection,
      ));

    testAll("spec mode with a non-spec URL", (request) =>
      request({ type: "bikeshed-spec", url: URL_ISSUES_LIST }).then(
        createErrorStatusTestCallback(failurePattern, 422),
        failOnRejection,
      ),
    );

    testAll("issues-list mode with a non-issues-list URL", (request) =>
      request({ type: "bikeshed-issues-list", url: URL_SPEC }).then(
        // FIXME: This should return 422 and match failurePattern after speced/bikeshed#3215 is fixed
        createErrorStatusTestCallback(/"error"/, 500),
        failOnRejection,
      ),
    );

    testAll(
      "when die-on is set and the build produces a message at/above that level",
      (request) =>
        request({
          type: "bikeshed-spec",
          url: URL_SPEC,
          "die-on": "warning",
        }).then(
          createErrorStatusTestCallback(failurePattern, 422),
          failOnRejection,
        ),
    );
  });

  describe("succeeds when it should", { timeout: 40000 }, () => {
    it("renders form UI upon GET w/ Accept: text/html and no url", () =>
      get({ type: "bikeshed-spec" }, { headers: { Accept: "text/html" } }).then(
        expectSuccessStatus,
        failOnRejection,
      ));

    testAll("renders spec, via raw.githubusercontent URL", (request) =>
      request({ type: "bikeshed-spec", url: URL_SPEC }).then(
        expectSuccessStatus,
        failOnRejection,
      ),
    );

    testAll(
      "renders messages instead of spec when output=messages",
      (request) =>
        request({
          type: "bikeshed-spec",
          output: "messages",
          url: URL_SPEC,
        }).then(
          (response) =>
            expectSuccessStatus(response, /"messageType":"success",/),
          failOnRejection,
        ),
    );

    testAll("renders spec with date overridden", (request) =>
      request({
        type: "bikeshed-spec",
        url: URL_SPEC,
        "md-date": "2025-11-10",
      }).then(
        (response) =>
          expectSuccessStatus(
            response,
            /<time class="dt-updated" datetime="2025-11-10">10 November 2025</,
          ),
        failOnRejection,
      ),
    );

    testAll(
      "renders spec with adjustments when Prepare for TR is set",
      (request) =>
        request({
          type: "bikeshed-spec",
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

    testAll("renders spec with fatal error when die-on=nothing", (request) =>
      request({
        type: "bikeshed-spec",
        url: URL_SPEC_FATAL,
        "die-on": "nothing",
      }).then(expectSuccessStatus, failOnRejection),
    );

    testAll("renders issues list", (request) =>
      request({
        type: "bikeshed-issues-list",
        url: URL_ISSUES_LIST,
      }).then(expectSuccessStatus),
    );
  });
});
