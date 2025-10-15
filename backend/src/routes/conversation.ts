import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
} from "../controllers/conversation";

const router = Router();

// All routes require authentication
router.get("/", authenticate, getConversations);
router.get("/:id", authenticate, getConversation);
router.post("/", authenticate, createConversation);
router.patch("/:id", authenticate, updateConversation);
router.delete("/:id", authenticate, deleteConversation);

export default router;
