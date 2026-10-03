const { handle, loadFromSupabase } = require("../server.js");

let loaded = false;

module.exports = async (req, res) => {
  if (!loaded) {
    await loadFromSupabase().catch(() => {});
    loaded = true;
  }
  return handle(req, res);
};
