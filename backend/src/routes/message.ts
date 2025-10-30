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

// TEMPORARY: Auth disabled for testing - RE-ENABLE BEFORE PRODUCTION!
router.get(
  "/conversations/:conversationId/messages",
  // authenticate, // TODO: Re-enable auth
  getMessages
);
router.post(
  "/conversations/:conversationId/messages",
  // authenticate, // TODO: Re-enable auth
  createMessage
);
router.post(
  "/conversations/:conversationId/messages/stream",
  // authenticate, // TODO: Re-enable auth
  streamMessage
);
router.delete(
  "/conversations/:conversationId/messages/:messageId",
  // authenticate, // TODO: Re-enable auth
  deleteMessage
);

export default router;
