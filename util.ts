import { lookup } from "dns/promises";
import type { Request } from "express";
import ipaddr from "ipaddr.js";

/**
 * Merges multiple URLSearchParams or FormData instances into the first one passed.
 */
export function mergeParams(
  destination: URLSearchParams,
  ...sources: URLSearchParams[]
): URLSearchParams;
export function mergeParams(
  destination: FormData,
  ...sources: FormData[] | URLSearchParams[]
): FormData;
export function mergeParams(
  destination: URLSearchParams | FormData,
  ...sources: URLSearchParams[] | FormData[]
) {
  for (const source of sources) {
    for (const [k, v] of source.entries()) {
      // Skip file inputs in case of FormData
      if (typeof v === "string") destination.set(k, v);
    }
  }
  return destination;
}

/**
 * Merges an Express request's body and query params into one URLSearchParams object.
 */
export function mergeRequestParams(req: Request) {
  const queryParams = new URLSearchParams(
    req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "",
  );
  if (!req.body) return queryParams;
  return mergeParams(new URLSearchParams(req.body), queryParams);
}

/** Returns the current (local) date in YYYY-MM-DD format. */
export const getShortIsoDate = () => new Date().toISOString().slice(0, 10);

/** Pattern that matches HTTP(S) URLs */
export const httpsProtocolPattern = /^https?:\/\//;

/** Extracts or looks up IP address from a URL hostname. */
async function resolveUrlToIpAddress({ hostname }: URL) {
  if (ipaddr.isValid(hostname)) return hostname;
  const maybeIPv6Hostname = hostname.replace(/^\[(.+)\]$/, "$1");
  if (ipaddr.isValid(maybeIPv6Hostname)) return maybeIPv6Hostname;
  return (await lookup(hostname)).address;
}

/** Parses an IP to check whether it is unicast. */
function isUnicastIp(ip: string) {
  const parsedIp = ipaddr.parse(ip);
  const range =
    parsedIp instanceof ipaddr.IPv6 && parsedIp.isIPv4MappedAddress()
      ? parsedIp.toIPv4Address().range()
      : parsedIp.range();
  return range === "unicast";
}

/**
 * Determines whether the provided URL points to a remote HTTP resource
 * whose hostname corresponds to a unicast IP.
 */
export async function isUnicastHttpUrl(url: string) {
  if (!httpsProtocolPattern.test(url)) return false;

  const isUnicast = isUnicastIp(await resolveUrlToIpAddress(new URL(url)));
  if (!isUnicast) return false;

  // Check for redirects, to also validate the final URL
  let currentUrl = url;
  for (let allowedRedirects = 10; allowedRedirects > 0; allowedRedirects--) {
    const { headers, status } = await fetch(currentUrl, {
      method: "HEAD",
      redirect: "manual",
    });
    const location = headers.get("location");
    if (status >= 300 && status < 400 && location) currentUrl = location;
    else break;

    if (allowedRedirects === 1) {
      console.error(`Redirect limit exceeded for ${url}`);
      return false;
    }
  }
  return isUnicastIp(await resolveUrlToIpAddress(new URL(currentUrl)));
}
