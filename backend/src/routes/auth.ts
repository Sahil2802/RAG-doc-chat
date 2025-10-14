import { Router } from "express";
import { signup, signin, getCurrentUser } from "../controllers/auth";
import { authenticate } from "../middleware/auth";

const router = Router();

// Public routes (no auth required)
router.post("/signup", signup);
router.post("/signin", signin);

// Protected routes (auth required)
router.get("/me", authenticate, getCurrentUser);

export default router;
