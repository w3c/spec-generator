'use strict';

const ASSERT = require('assert'),
  REQUEST = require('request'),
  SPEC_GEN = require('../server');

const PORT = 3000,
  AUTHORIZATION = encodeURIComponent(process.env.AUTHORIZATION),
  BASE_URL = 'http://localhost:3000/',
  NO_URL = '&type=foo&URL=notice-that-its-in-uppercase',
  NO_TYPE = '&url=foo&TYPE=notice-that-its-in-uppercase',
  BAD_GENERATOR = '&type=fluxor&url=http://example.com/',
  BAD_SHORTNAME = '&type=RESPEC&url=http://example.com/%3FshortName%3Ddiplodocus',
  NO_RESPEC = '&type=RESPEC&url=http://example.com/',
  SUCCESS1 = `&type=respec&url=https://w3c.github.io/manifest/?${AUTHORIZATION}`,
  SUCCESS2 = `&type=respec&url=https://w3c.github.io/payment-request/?${AUTHORIZATION}`,
  SUCCESS3 = `&type=respec&url=https://w3c.github.io/resource-hints/?${AUTHORIZATION}`;

const FAILS_WITH = (done, expectedMessage = '{"error":"Both \'type\' and \'url\' are required."}', expectedCode = 500) =>
  (error, response, body) => {
    ASSERT.equal(error, null);
    ASSERT.equal(response.statusCode, expectedCode);
    if (expectedMessage instanceof RegExp)
      ASSERT.ok(body.match(expectedMessage));
    else
      ASSERT.equal(body, expectedMessage);
    done();
  }
;

const SUCCEEDS = (done) =>
  (error, response, body) => {
    ASSERT.equal(error, null);
    ASSERT.equal(response.statusCode, 200);
    ASSERT.equal(response.statusMessage, 'OK');
    done();
  };
;

let server;

describe('spec-generator', () => {

  before(() => {
    server = SPEC_GEN.start(PORT);
  });

  describe('fails when it should', () => {
    it('without parameters', (done) => REQUEST.get(BASE_URL, FAILS_WITH(done)));
    it('if there\'s no URL', (done) => REQUEST.get(BASE_URL + NO_URL, FAILS_WITH(done)));
    it('if there\'s no type', (done) => REQUEST.get(BASE_URL + NO_TYPE, FAILS_WITH(done)));
    it('if the generator is not valid', (done) => REQUEST.get(BASE_URL + BAD_GENERATOR, FAILS_WITH(done, '{"error":"Unknown generator: fluxor"}')));
    it('if the shortname is not valid', (done) => REQUEST.get(BASE_URL + BAD_SHORTNAME, FAILS_WITH(done, '{"error":"Not Found"}', 404)));
    it('if the URL does not point to a Respec document', (done) => REQUEST.get(BASE_URL + NO_RESPEC, FAILS_WITH(
      done,
      /That\ doesn't\ seem\ to\ be\ a\ ReSpec\ document\.\ Please\ check\ manually\:/
    )));
  });

  describe('succeeds when it should', () => {
    it('Web App Manifest ("appmanifest")', (done) => REQUEST.get(BASE_URL + SUCCESS1, SUCCEEDS(done)));
    it('Payment Request API ("payment-request")', (done) => REQUEST.get(BASE_URL + SUCCESS2, SUCCEEDS(done)));
    it('Resource Hints ("resource-hints")', (done) => REQUEST.get(BASE_URL + SUCCESS3, SUCCEEDS(done)));
  });

  after(() => server.close());

});
