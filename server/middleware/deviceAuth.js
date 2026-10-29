import jwt from "jsonwebtoken";
import Member from "../models/Member.js";

// A signed-in device: its token names the account and the member who signed
// it in (the owner, or whoever linked it). Who is holding the device right now
// is a PIN on the device; the server only knows whose device it is.
const deviceAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  let claims;
  try {
    claims = jwt.verify(header.slice("Bearer ".length), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
  if (claims.kind !== "device" || typeof claims.accountId !== "string" || typeof claims.memberId !== "string") {
    return res.status(401).json({ success: false, message: "Not a device token" });
  }

  const member = await Member.findOne({ accountId: claims.accountId, _id: claims.memberId }).lean();
  if (!member || member.removedAt != null) {
    return res.status(401).json({ success: false, message: "This device is no longer signed in" });
  }

  req.device = { accountId: claims.accountId, member };
  next();
};

export default deviceAuth;
