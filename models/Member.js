import mongoose from "mongoose";
import tenantScoped from "./tenantScoped.js";

// A person who works for the account, with a role in one shop or all of them.
const memberSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    roleId: { type: String, required: true },
    scope: {
      kind: { type: String, enum: ["allShops", "shop"], required: true },
      shopId: String,
    },
    /** Left the restaurant: kept for the names on old records, can do nothing. */
    removedAt: Number,
  },
  { timestamps: true },
);
memberSchema.plugin(tenantScoped);

export default mongoose.model("Member", memberSchema);
