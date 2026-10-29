import express from "express";
import { requestCode, verifyCode } from "../controllers/authController.js";
import validate from "../middleware/validate.js";
import { codeRequestSchema, verifySchema } from "../validators/schemas.js";
import { codeLimiter, verifyLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/code", codeLimiter, validate(codeRequestSchema), requestCode);
router.post("/verify", verifyLimiter, validate(verifySchema), verifyCode);

export default router;
