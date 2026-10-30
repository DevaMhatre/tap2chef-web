// The API on a throwaway in-memory database: for trying the app and running
// the browser scripts without installing MongoDB. Codes print to this console.
import "dotenv/config";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET ??= "dev-only-secret";
const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());
const { default: app } = await import("../app.js");

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`API on :${PORT}, in-memory database`));
