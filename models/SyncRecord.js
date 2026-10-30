import mongoose from "mongoose";
import tenantScoped from "./tenantScoped.js";

// One record of one synced table, as the device last sent it. `seq` is the
// order it reached the server: the last arrival wins, never a device clock.
const syncRecordSchema = new mongoose.Schema(
  {
    table: { type: String, required: true },
    id: { type: String, required: true },
    /** Only on shop-level records; the menu belongs to the whole account. */
    shopId: String,
    deleted: { type: Boolean, default: false },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    seq: { type: Number, required: true },
  },
  { timestamps: true, minimize: false },
);
syncRecordSchema.plugin(tenantScoped);
syncRecordSchema.index({ accountId: 1, table: 1, id: 1 }, { unique: true });
syncRecordSchema.index({ accountId: 1, seq: 1 });

export default mongoose.model("SyncRecord", syncRecordSchema);
