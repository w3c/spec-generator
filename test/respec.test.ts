import assert from "assert";
import { describe, it } from "node:test";

import {
  createErrorStatusTestCallback,
  createSuite,
  expectSuccessStatus,
  failOnRejection,
  testFetchHelpers,
} from "./test-util.js";

const URL_NO_RESPEC = "https://w3c.github.io/wcag/";
const URL_SUCCESS = `https://w3c.github.io/spec-generator/respec.html`;
const URL_SUCCESS_RAW = `https://raw.githubusercontent.com/w3c/spec-generator/refs/heads/gh-pages/respec.html`;

const expectNoFailedIncludes = async (response: Response) => {
  assert.doesNotMatch(await response.text(), /Cannot GET \//);
};

const { get, post, testAll } = testFetchHelpers;

createSuite("ReSpec", () => {
  describe("fails when it should", { timeout: 10000 }, () => {
    it("without url or file parameter (GET)", () =>
      get({ type: "respec" }).then(
        createErrorStatusTestCallback(
          /^\{"error":"Both 'type' and 'url' are required"\}$/,
        ),
        failOnRejection,
      ));

    it("without url or file parameter (POST)", () =>
      post({ type: "respec" }).then(
        createErrorStatusTestCallback(
          /^{"error":"Missing file upload or url"}$/,
        ),
        failOnRejection,
      ));

    it("if the URL does not point to a Respec document", () =>
      get({ type: "respec", url: URL_NO_RESPEC }).then(
        createErrorStatusTestCallback(
          /That doesn't seem to be a ReSpec document. Please check manually:/,
          500,
        ),
        failOnRejection,
      ));
  });

  describe("succeeds when it should", { timeout: 35000 }, () => {
    it("renders form UI upon GET w/ Accept: text/html and no url", () =>
      get({ type: "respec" }, { headers: { Accept: "text/html" } }).then(
        expectSuccessStatus,
        failOnRejection,
      ));

    testAll("renders valid ReSpec document, via direct URL", (request) =>
      request({ type: "respec", url: URL_SUCCESS }).then((response) => {
        expectSuccessStatus(response);
        expectNoFailedIncludes(response);
      }, failOnRejection),
    );

    testAll(
      "renders valid ReSpec document, via raw.githubusercontent",
      (request) =>
        request({ type: "respec", url: URL_SUCCESS_RAW }).then((response) => {
          expectSuccessStatus(response);
          expectNoFailedIncludes(response);
        }, failOnRejection),
    );

    testAll("renders spec with date overridden via md-date", (request) =>
      request({
        type: "respec",
        url: URL_SUCCESS,
        "md-date": "2025-11-10",
      }).then(
        (response) =>
          expectSuccessStatus(
            response,
            /<time class="dt-published" datetime="2025-11-10">10 November 2025</,
          ),
        failOnRejection,
      ),
    );

    it("renders spec with date overridden via md-publishDate", () =>
      get({
        type: "respec",
        url: URL_SUCCESS,
        "md-publishDate": "2025-11-10",
      }).then(
        (response) =>
          expectSuccessStatus(
            response,
            /<time class="dt-published" datetime="2025-11-10">10 November 2025</,
          ),
        failOnRejection,
      ));

    testAll("renders spec with date overridden via url", (request) =>
      request({
        type: "respec",
        url: `${URL_SUCCESS}?publishDate=2025-11-10`,
      }).then(
        (response) =>
          expectSuccessStatus(
            response,
            /<time class="dt-published" datetime="2025-11-10">10 November 2025</,
          ),
        failOnRejection,
      ),
    );

    // TODO: test die-on
  });
});
