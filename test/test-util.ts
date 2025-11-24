import assert from "assert";
import { it } from "node:test";

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
    assert.equal(response.status, expectedCode);
    const responseText = await response.text();
    assert.match(responseText, expectedMessage);
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

export const TEST_PORT = 3000;
const BASE_URL = `http://localhost:${TEST_PORT}/`;

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
