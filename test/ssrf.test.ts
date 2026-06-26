import assert from "assert";
import { describe, it } from "node:test";

// @ts-ignore — internal exports for testing
import { checkHostname } from "../ssrf.js";
import { SpecGeneratorError } from "../generators/common.js";

async function assertBlocked(hostname: string) {
  await assert.rejects(
    () => checkHostname(hostname),
    (err) => err instanceof SpecGeneratorError && err.status === 400,
    `Expected ${hostname} to be blocked`,
  );
}

describe("SSRF guard – checkHostname()", () => {
  it("blocks loopback IPv4 literal", () => assertBlocked("127.0.0.1"));
  it("blocks loopback IPv4 range", () => assertBlocked("127.0.0.2"));
  it("blocks private 10.x.x.x", () => assertBlocked("10.0.0.1"));
  it("blocks private 172.16.x.x", () => assertBlocked("172.16.0.1"));
  it("blocks private 192.168.x.x", () => assertBlocked("192.168.1.1"));
  it("blocks link-local / cloud metadata", () =>
    assertBlocked("169.254.169.254"));
  it("blocks 0.0.0.0", () => assertBlocked("0.0.0.0"));
  it("blocks IPv6 loopback literal", () => assertBlocked("::1"));
  it("blocks IPv6 link-local", () => assertBlocked("fe80::1"));
  it("blocks IPv4-mapped IPv6 private", () =>
    assertBlocked("::ffff:192.168.1.1"));
  it("blocks IPv4-mapped IPv6 loopback", () =>
    assertBlocked("::ffff:127.0.0.1"));
  it("allows public IP", async () => {
    // 1.1.1.1 is Cloudflare DNS — always public
    await assert.doesNotReject(() => checkHostname("1.1.1.1"));
  });
  it("allows example.com (resolves to public IP)", async () => {
    await assert.doesNotReject(() => checkHostname("example.com"));
  });
});
