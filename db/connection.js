import mongoose from "mongoose";
import "dotenv/config";

const connectionDB = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to the database");
};

export default connectionDB;
