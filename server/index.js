import "dotenv/config";
import connectionDB from "./db/connection.js";
import app from "./app.js";

const PORT = process.env.PORT || 8000;
// On the VPS, 127.0.0.1: only nginx may reach the API, never the internet directly.
const HOST = process.env.HOST || undefined;

// Without its database the API can only fail, so it doesn't start; pm2 tries again.
connectionDB()
  .then(() => {
    app.listen(PORT, HOST, () => console.log(`🚀 Server running on ${HOST ?? "*"}:${PORT}`));
  })
  .catch((error) => {
    console.error("Couldn't reach the database:", error.message);
    process.exit(1);
  });
