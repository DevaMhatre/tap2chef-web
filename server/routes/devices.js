import express from "express";
import { createLinkCode, join, listDevices, removeDevice } from "../controllers/deviceController.js";
import deviceAuth from "../middleware/deviceAuth.js";
import { verifyLimiter } from "../middleware/rateLimiters.js";
import validate from "../middleware/validate.js";
import { joinSchema, linkCodeSchema } from "../validators/schemas.js";

const router = express.Router();

// A joining phone has no token yet: the code is its only proof, so guesses are limited.
router.post("/join", verifyLimiter, validate(joinSchema), join);

router.use(deviceAuth);
router.get("/", listDevices);
router.post("/link-code", validate(linkCodeSchema), createLinkCode);
router.delete("/:id", removeDevice);

export default router;
