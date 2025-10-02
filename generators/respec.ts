/// <reference path="./respec.d.ts" />
import { toHTML } from "respec";

interface SpecGeneratorErrorConstructorOptions {
    message: string;
    status: number;
}

class SpecGeneratorError extends Error {
    status: number;
    constructor({ status, message }: SpecGeneratorErrorConstructorOptions) {
        super(message);
        this.status = status;
    }
}

export async function generate(url: string) {
    try {
        console.log("Generating", url);
        const { html, errors, warnings } = await toHTML(url, {
            timeout: 30000,
            disableSandbox: true,
            disableGPU: true,
        });
        return { html, errors: errors.length, warnings: warnings.length };
    } catch (err) {
        throw new SpecGeneratorError({ status: 500, message: err.message });
    }
}
