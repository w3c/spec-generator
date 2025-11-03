import type { Request } from "express";

/** Appends multiple URLSearchParams instances into the first one passed */
export function appendParams(
    destination: URLSearchParams,
    ...sources: URLSearchParams[]
) {
    for (const source of sources) {
        for (const [k, v] of source.entries()) {
            destination.append(k, v);
        }
    }
    return destination;
}

/** Appends an Express request's body and query params into a single URLSearchParams object */
export function mergeRequestParams(req: Request) {
    const queryParams = new URLSearchParams(
        req.url.slice(req.url.indexOf("?")),
    );
    if (!req.body) return queryParams;
    return appendParams(new URLSearchParams(req.body), queryParams);
}

/** Returns the current (local) date in YYYY-MM-DD format */
export const getShortIsoDate = () => new Date().toISOString().slice(0, 10);
