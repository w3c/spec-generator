const { toHTML } = require("respec");

class SpecGeneratorError extends Error {
  constructor({ status, message }) {
    super(message);
    this.status = status;
  }
}

exports.generate = async function generate(url) {
  try {
    console.log("Generating", url);
    const { html } = await toHTML(url, {
      timeout: 30000,
      disableSandbox: true,
    });
    return html;
  } catch (err) {
    throw new SpecGeneratorError({ status: 500, message: err.message });
  }
};
