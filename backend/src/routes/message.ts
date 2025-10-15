import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  getMessages,
  createMessage,
  deleteMessage,
  streamMessage,
} from "../controllers/message";

const router = Router();

// All routes require authentication
// Routes are nested under /conversations/:conversationId
router.get(
  "/conversations/:conversationId/messages",
  authenticate,
  getMessages
);
router.post(
  "/conversations/:conversationId/messages",
  authenticate,
  createMessage
);
router.post(
  "/conversations/:conversationId/messages/stream",
  authenticate,
  streamMessage
);
router.delete(
  "/conversations/:conversationId/messages/:messageId",
  authenticate,
  deleteMessage
);

export default router;
