import { toHTML } from "respec";

class SpecGeneratorError extends Error {
    constructor({ status, message }) {
        super(message);
        this.status = status;
    }
}

export async function generate(url) {
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
