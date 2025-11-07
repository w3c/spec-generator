import type { Request } from "express";

/** Appends multiple URLSearchParams or FormData instances into the first one passed */
export function appendParams(
  destination: URLSearchParams,
  ...sources: URLSearchParams[]
): URLSearchParams;
export function appendParams(
  destination: FormData,
  ...sources: FormData[] | URLSearchParams[]
): FormData;
export function appendParams(
  destination: URLSearchParams | FormData,
  ...sources: URLSearchParams[] | FormData[]
) {
  for (const source of sources) {
    for (const [k, v] of source.entries()) {
      // Skip file inputs in case of FormData
      if (typeof v === "string") destination.append(k, v);
    }
  }
  return destination;
}

/** Appends an Express request's body and query params into a single URLSearchParams object */
export function mergeRequestParams(req: Request) {
  const queryParams = new URLSearchParams(req.url.slice(req.url.indexOf("?")));
  if (!req.body) return queryParams;
  return appendParams(new URLSearchParams(req.body), queryParams);
}

/** Returns the current (local) date in YYYY-MM-DD format */
export const getShortIsoDate = () => new Date().toISOString().slice(0, 10);
