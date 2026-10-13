import assert from "assert";
import { readFile } from "fs/promises";
import { join } from "path";
import { it } from "node:test";

import { mergeParams } from "../util.js";

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

export const getSpecBlob = async (filename: string) =>
  new Blob([await readFile(join("test", "specs", filename), "utf8")]);

type FetchHelper = (
  params: Record<string, string>,
  init?: RequestInit,
) => Promise<Response>;

type FetchFormHelper = (
  formData: FormData,
  init?: RequestInit,
) => Promise<Response>;

interface FetchHelpers {
  get: FetchHelper;
  post: FetchHelper;
  /** Fetches via POST, with parameters defined via FormData (to allow for file uploads). */
  postForm: FetchFormHelper;
  /** Fetches via POST, but using GET parameters. */
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
    mergeParams(url.searchParams, new URLSearchParams(params));
    return fetch(url, init);
  },
  post(params, init?) {
    return fetch(new URL(BASE_URL), {
      body: mergeParams(new FormData(), new URLSearchParams(params)),
      method: "POST",
      ...init,
    });
  },
  postForm(formData, init?) {
    return fetch(new URL(BASE_URL), {
      body: formData,
      method: "POST",
      ...init,
    });
  },
  mixed(params, init?) {
    const url = new URL(BASE_URL);
    mergeParams(url.searchParams, new URLSearchParams(params));
    return fetch(url, { method: "POST", ...init });
  },
  /** Runs a test across multiple permutations of request methods/parameters. */
  testAll(message, callback) {
    it(`${message} (GET)`, () => callback(testFetchHelpers.get));
    it(`${message} (POST)`, () => callback(testFetchHelpers.post));
    it(`${message} (Mixed)`, () => callback(testFetchHelpers.mixed));
  },
};
