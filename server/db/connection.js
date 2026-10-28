import mongoose from "mongoose";
import "dotenv/config";

const connectionDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connection succsess");
  } catch (error) {
    console.log("Error occured during connection to Database", error);
  }
};

export default connectionDB;
