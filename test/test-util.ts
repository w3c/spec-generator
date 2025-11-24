import assert from "assert";
import type { Server } from "http";
import { after, before, describe, it } from "node:test";

import { start } from "../server.js";
import { appendParams } from "../util.js";

export const expectSuccessStatus = async (
  response: Response,
  expectedMessage?: RegExp,
) => {
  assert.equal(response.status, 200);
  assert.equal(response.statusText, "OK");
  if (expectedMessage) {
    const responseText = await response.text();
    assert.match(responseText, expectedMessage);
  }
};

export const createErrorStatusTestCallback =
  (expectedMessage: RegExp, expectedCode = 400) =>
  async (response: Response) => {
    const responseText = await response.text();
    assert.match(responseText, expectedMessage);
    assert.equal(response.status, expectedCode);
  };

export const failOnRejection = (error: Error) =>
  assert.fail(`Unexpected fetch promise rejection: ${error}`);

export type FetchHelper = (
  params: Record<string, string>,
  init?: RequestInit,
) => Promise<Response>;
interface FetchHelpers {
  get: FetchHelper;
  post: FetchHelper;
  mixed: FetchHelper;
  testAll: (
    message: string,
    callback: (request: FetchHelper) => Promise<void>,
  ) => void;
}

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}/`;

export const testFetchHelpers: FetchHelpers = {
  get(params, init?) {
    const url = new URL(BASE_URL);
    appendParams(url.searchParams, new URLSearchParams(params));
    return fetch(url, init);
  },
  post(params, init?) {
    return fetch(new URL(BASE_URL), {
      body: appendParams(new FormData(), new URLSearchParams(params)),
      method: "POST",
      ...init,
    });
  },
  /** Fetches via POST, but using GET parameters */
  mixed(params, init?) {
    const url = new URL(BASE_URL);
    appendParams(url.searchParams, new URLSearchParams(params));
    return fetch(url, { method: "POST", ...init });
  },
  /** Runs a test across multiple request permutations */
  async testAll(message, callback) {
    it(`${message} (GET)`, () => callback(testFetchHelpers.get));
    it(`${message} (POST)`, () => callback(testFetchHelpers.post));
    it(`${message} (Mixed)`, () => callback(testFetchHelpers.mixed));
  },
};

export function createSuite(name: string, callback: () => void) {
  let testServer: Server;

  describe(`spec-generator: ${name}`, () => {
    before(async () => {
      testServer = await start(PORT);
      // Avoid failure due to test running too soon
      // (waiting for `listening` event isn't enough?)
      return new Promise((resolve) => setTimeout(resolve, 15));
    });

    after(() => testServer.close());

    callback();
  });
}
