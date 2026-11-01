import mongoose from "mongoose";

// The subscriber. Its id is made on the owner's device at first use and
// adopted at sign-up, so the device's records never need re-tagging.
const accountSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    /** The last sync number handed out; every record change takes the next. */
    seq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model("Account", accountSchema);
