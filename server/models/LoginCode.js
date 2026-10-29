import mongoose from "mongoose";

// The one live sign-in code for an email, stored only as a hash. Asking again
// replaces it; Mongo removes it once it expires.
const loginCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  codeHash: { type: String, required: true },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
});
loginCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("LoginCode", loginCodeSchema);
