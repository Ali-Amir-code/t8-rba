import express from "express";
import jwtAuth from "../middleware/auth.js";
import { getProfile, updateProfile } from "../controllers/profileController.js";

const router = express.Router();

router.use(jwtAuth);

router.get("/", getProfile);
router.put("/", updateProfile);

export default router;
