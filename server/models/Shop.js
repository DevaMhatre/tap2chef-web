import mongoose from "mongoose";
import tenantScoped from "./tenantScoped.js";

const shopSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);
shopSchema.plugin(tenantScoped);

export default mongoose.model("Shop", shopSchema);
