import type { Request } from "express";

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
