import mongoose from "mongoose";

// Someone who signs devices in with their email: an owner today. Which
// accounts they belong to lives here, so finding them at sign-in never needs
// a query across accounts (the tenancy gate refuses one).
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    memberships: [{ _id: false, accountId: { type: String, required: true }, memberId: { type: String, required: true } }],
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
