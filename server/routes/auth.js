import express from "express";
import { login } from "../controllers/authController.js";
import validate from "../middleware/validate.js";
import { loginSchema } from "../validators/schemas.js";
import { loginLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/login", loginLimiter, validate(loginSchema), login);

export default router;
