const { fetchAndWrite: respecWriter } = require("respec/tools/respecDocWriter");

class SpecGeneratorError extends Error {
  constructor({ status, message }) {
    super(message);
    this.status = status;
  }
}

exports.generate = async function generate(url) {
  const opts = { timeout: 20000, disableSandbox: true };
  try {
    console.log("Generating", url);
    const result = await respecWriter(url, "/dev/null", {}, opts);
    return result;
  } catch (err) {
    throw new SpecGeneratorError({ status: 500, message: err.message });
  }
};
