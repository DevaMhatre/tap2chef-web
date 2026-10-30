import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import Device from "../models/Device.js";

const LIFETIME = "365d";

export const deviceToken = (accountId, memberId, deviceId) =>
  jwt.sign({ kind: "device", accountId, memberId, deviceId }, process.env.JWT_SECRET, { expiresIn: LIFETIME });

/** "Android phone", or "Phone" when the device didn't say. */
export const deviceLabel = (label) => (typeof label === "string" && label.trim() ? label.trim().slice(0, 40) : "Phone");

/** A device record for a phone that has just been let in, and the token that names it. */
export async function signInDevice({ accountId, shopId, memberId, kind, label }) {
  const device = await Device.create({
    _id: crypto.randomUUID(),
    accountId,
    shopId,
    memberId,
    kind,
    label: deviceLabel(label),
    lastSeenAt: new Date(),
  });
  return { device, token: deviceToken(accountId, memberId, device._id) };
}
