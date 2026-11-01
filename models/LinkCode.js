import mongoose from "mongoose";

// The one live code for adding a phone to a shop, stored only as a hash. A
// joining phone knows nothing but the code, so it is found by its hash, not
// by account; asking for a new one replaces it; Mongo removes it once expired.
const linkCodeSchema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  shopId: { type: String, required: true, unique: true },
  /** The owner who showed it. */
  memberId: { type: String, required: true },
  /** Who the phone is for: it joins as this person, with this role. */
  person: {
    name: { type: String, required: true },
    roleId: { type: String, enum: ["manager", "staff"], required: true },
  },
  expiresAt: { type: Date, required: true },
});
linkCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("LinkCode", linkCodeSchema);
