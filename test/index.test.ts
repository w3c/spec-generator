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

const { get, post, testAll } = testFetchHelpers;

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

      describe("invalid URLs", () => {
        const originalFetch = globalThis.fetch;

        before(() => {
          globalThis.fetch = async (input, init) => {
            const urlStr = "" + input;
            if (urlStr.includes("//w3.org/malicious-example/"))
              return new Response(null, {
                headers: { location: "http://192.168.1.2/" },
                status: 301,
              });
            else if (urlStr.includes("//192.168.1.2"))
              return new Response(null, { status: 200 });
            else if (urlStr.includes("//w3.org/broken-example/"))
              return new Response(null, {
                headers: { location: "https://w3.org/broken-example/" },
                status: 302,
              });

            // Pass through to allow actual server API calls to proceed as usual
            return originalFetch(input, init);
          };
        });

        after(() => {
          globalThis.fetch = originalFetch;
        });

        const urls = [
          // incomplete URL
          "//w3.org",
          "/publications/",
          // wrong protocol
          "ftp://example.com",
          // localhost (loopback)
          "http://127.0.0.1",
          "http://[::1]",
          "http://localhost",
          // private
          "https://192.168.1.2",
          "https://10.100.11.2",
          // linkLocal
          "https://169.254.1.2",
          "https://[fe80::1]",
          "https://[::ffff:a9fe:102]", // IPv4-mapped IPv6 address
          // uniqueLocal
          "https://[fd00::1]",
          // External URLs (not real, but need to use a real domain to avoid DNS lookup failures)
          "https://w3.org/malicious-example/", // Redirects to internal IP via header
          "https://w3.org/broken-example/", // Redirects infinitely
        ];

        const types = ["bikeshed-spec", "bikeshed-issues-list", "respec"];

        for (const url of urls) {
          for (const type of types) {
            testAll(`responds with 400 status for ${type} ${url}`, (request) =>
              request({ type, url }).then(
                createErrorStatusTestCallback(/^{"error":"Invalid url"}$/),
                failOnRejection,
              ),
            );
          }
        }
      });
    });

    describe("succeeds when it should", () => {
      it("renders form UI upon GET w/ Accept: text/html and no params", () =>
        get({}, { headers: { Accept: "text/html" } }).then(
          expectSuccessStatus,
          failOnRejection,
        ));
    });
  });

  // Run tests for each generator type,
  // within the same top-level suite and server instance
  await import("./bikeshed.test.js");
  await import("./respec.test.js");
});
