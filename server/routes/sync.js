import express from "express";
import { pull, push } from "../controllers/syncController.js";
import deviceAuth from "../middleware/deviceAuth.js";
import validate, { validateQuery } from "../middleware/validate.js";
import { pullQuerySchema, pushSchema } from "../validators/schemas.js";

const router = express.Router();

router.use(deviceAuth);
router.post("/push", validate(pushSchema), push);
router.get("/pull", validateQuery(pullQuerySchema), pull);

export default router;
