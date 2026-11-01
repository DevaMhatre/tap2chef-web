import mongoose from "mongoose";
import tenantScoped from "./tenantScoped.js";

// One menu and the shops that sell it ("Sharma Biryani"); a café is another
// brand. The owner only ever sees "restaurants". An account's first brand has
// the account's id, so devices upgrading on their own all name the same one.
const brandSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);
brandSchema.plugin(tenantScoped);

export default mongoose.model("Brand", brandSchema);
