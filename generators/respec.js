const { toHTML } = require("respec");

class SpecGeneratorError extends Error {
    constructor({ status, message }) {
        super(message);
        this.status = status;
    }
}

exports.generate = async function generate(url) {
    try {
        // eslint-disable-next-line no-console
        console.log("Generating", url);
        const { html, errors, warnings } = await toHTML(url, {
            timeout: 30000,
            disableSandbox: true,
        });
        return { html, errors: errors.length, warnings: warnings.length };
    } catch (err) {
        throw new SpecGeneratorError({ status: 500, message: err.message });
    }
};
