import "dotenv/config";
import connectionDB from "./db/connection.js";
import app from "./app.js";

const PORT = process.env.PORT || 8000;

connectionDB().finally(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
