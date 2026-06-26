import dns from "dns/promises";

import ipaddr from "ipaddr.js";

import { SpecGeneratorError } from "./generators/common.js";

const ALLOWED_RANGES = new Set(["unicast"]);

function isBlockedIP(ip: string): boolean {
  try {
    let addr = ipaddr.parse(ip);
    // Unwrap IPv4-mapped IPv6 (::ffff:x.x.x.x) so range() reflects the IPv4 range
    if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
      addr = (addr as ipaddr.IPv6).toIPv4Address();
    }
    return !ALLOWED_RANGES.has(addr.range());
  } catch {
    return true;
  }
}

export async function checkHostname(hostname: string): Promise<void> {
  // If the hostname is already an IP literal, check it directly
  if (ipaddr.isValid(hostname)) {
    if (isBlockedIP(hostname)) {
      throw new SpecGeneratorError({
        message: `Blocked IP address: ${hostname}`,
        status: 400,
      });
    }
    return;
  }

  const { address } = await dns.lookup(hostname);
  if (isBlockedIP(address)) {
    throw new SpecGeneratorError({
      message: `URL resolves to a blocked IP address`,
      status: 400,
    });
  }
}

/**
 * Drop-in fetch() replacement that guards against SSRF.
 * Resolves DNS before connecting and re-validates after every redirect.
 */
export async function safeFetch(
  url: string | URL,
  init?: RequestInit,
  maxRedirects = 5,
): Promise<Response> {
  let current = typeof url === "string" ? url : url.href;

  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(current);
    await checkHostname(parsed.hostname);

    const response = await fetch(current, { ...init, redirect: "manual" });

    // Not a redirect — return as-is
    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) return response;

    // Resolve relative Location headers
    current = new URL(location, current).href;
  }

  throw new SpecGeneratorError({ message: "Too many redirects", status: 400 });
}
