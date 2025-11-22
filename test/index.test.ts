import { describe, it } from "node:test";

import {
  createErrorStatusTestCallback,
  createSuite,
  expectSuccessStatus,
  failOnRejection,
  testFetchHelpers,
} from "./test-util.js";

// Run tests for each generator type
import "./bikeshed.test.js";
import "./respec.test.js";

const { get, post } = testFetchHelpers;

createSuite("General", () => {
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
