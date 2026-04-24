const app = require("../server");

module.exports = async (req, res) => {
  try {
    await app.ready();
    return app(req, res);
  } catch (error) {
    console.error("Vercel handler failed:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Server startup failed.", details: error.message }));
  }
};
