import mongoose from "mongoose";
import tenantScoped from "./tenantScoped.js";

// A phone, tablet or computer signed in to a restaurant. The owner's own
// phone signed in with their email; a linked one joined with a code shown on
// the owner's phone. Removed, its token stops working and it clears itself.
const deviceSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    shopId: { type: String, required: true },
    /** Whose permissions it works with on the server: the owner who signed it in or linked it. */
    memberId: { type: String, required: true },
    kind: { type: String, enum: ["owner", "linked"], required: true },
    /** "Android phone", "iPhone": what the owner sees in the list. */
    label: { type: String, required: true },
    lastSeenAt: { type: Date, required: true },
    removedAt: Date,
  },
  { timestamps: true },
);
deviceSchema.plugin(tenantScoped);

export default mongoose.model("Device", deviceSchema);
