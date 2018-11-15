const { fetchAndWrite : respecWriter } = require("respec/tools/respecDocWriter");

exports.generate = async function generate(urlToGenerate, params, cb) {
  const url = new URL(urlToGenerate);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const opts = { timeout: 20000, disableSandbox: true };
  try {
    console.log("Generating", url.href);
    const html = await respecWriter(url.href, "/dev/null", {}, opts);
    cb(null, html);
  } catch (err) {
    cb({ status: 500, message: err.message });
  }
}
