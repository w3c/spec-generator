import assert from "assert";
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
const URL_NO_RESPEC = "https://w3c.github.io/wcag/";
const URL_SUCCESS = `https://w3c.github.io/spec-generator/respec.html`;
const URL_SUCCESS_RAW = `https://raw.githubusercontent.com/w3c/spec-generator/refs/heads/gh-pages/respec.html`;

const expectNoFailedIncludes = async (response: Response) => {
  assert.doesNotMatch(await response.text(), /Cannot GET \//);
};

const { get } = createFetchHelpers(`http://localhost:${PORT}/`);

let testServer: Server;

describe("spec-generator: ReSpec", { timeout: 30000 }, () => {
  before(() => {
    testServer = start(PORT);
  });

  describe("fails when it should", () => {
    it("without parameters", () =>
      get({}).then(createErrorStatusTestCallback(), failOnRejection));
    it("if the URL does not point to a Respec document", () =>
      get({ url: URL_NO_RESPEC }).then(
        createErrorStatusTestCallback(
          /That doesn't seem to be a ReSpec document. Please check manually:/,
          500,
        ),
        failOnRejection,
      ));
  });

  describe("succeeds when it should", () => {
    it("renders form UI upon GET w/ Accept: text/html and no params", () =>
      get({}, { headers: { Accept: "text/html" } }).then(
        expectSuccessStatus,
        failOnRejection,
      ));
    it("renders valid ReSpec document, via direct URL", () =>
      get({ url: URL_SUCCESS }).then((response) => {
        expectSuccessStatus(response);
        expectNoFailedIncludes(response);
      }, failOnRejection));
    it("renders valid ReSpec document, via raw.githubusercontent", () =>
      get({ url: URL_SUCCESS_RAW }).then((response) => {
        expectSuccessStatus(response);
        expectNoFailedIncludes(response);
      }, failOnRejection));
  });

  after(() => testServer.close());
});
