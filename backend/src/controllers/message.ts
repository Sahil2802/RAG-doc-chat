import { Response } from "express";
import supabase from "../services/supabase";
import { streamAIResponse, StreamChunk } from "../services/ai";
import { AuthRequest } from "../types";

/**
 * Get messages for a conversation with cursor-based pagination (ChatGPT-style)
 * Uses created_at + id as cursor for efficient deep pagination (O(1) per page)
 *
 * Initial load (no cursor): Returns most recent messages DESC (newest-first)
 * Client should reverse array for display (oldest at top, newest at bottom)
 *
 * Query params:
 * - limit: number of messages per page (default 50, max 100)
 * - cursor: optional cursor from previous response (format: "timestamp_id")
 * - direction: 'after' (newer messages, ASC) or 'before' (older messages, DESC)
 *
 * Usage:
 * 1. Initial: GET /messages → returns newest 50 DESC, client reverses
 * 2. Load older: GET /messages?cursor=<oldest>&direction=before → prepend reversed results
 * 3. Load newer: GET /messages?cursor=<newest>&direction=after → append results
 */
export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    // TEMPORARY: Skip auth check for testing - RE-ENABLE BEFORE PRODUCTION!
    // if (!req.userId) {
    //   return res.status(401).json({ error: "Unauthorized" });
    // }

    const { conversationId } = req.params;
    const rawLimit = String(req.query.limit ?? "");
    const cursor = req.query.cursor as string | undefined;
    const direction = (req.query.direction as string) || "after";

    // Parse and validate limit
    const parsedLimit = Number.parseInt(rawLimit, 10);
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 100;
    let limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : DEFAULT_LIMIT;
    limit = Math.min(limit, MAX_LIMIT);

    // Validate direction
    if (!["after", "before"].includes(direction)) {
      return res
        .status(400)
        .json({ error: "direction must be 'after' or 'before'" });
    }

    // First, verify conversation exists (auth check disabled for testing)
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      // .eq("user_id", req.userId) // TEMPORARY: Disabled for testing
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Parse cursor (format: "timestamp_id")
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;
    if (cursor) {
      const parts = cursor.split("_");
      if (parts.length === 2) {
        cursorCreatedAt = parts[0];
        cursorId = parts[1];
      } else {
        return res.status(400).json({ error: "Invalid cursor format" });
      }
    }

    // Build query with cursor (keyset pagination)
    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId);

    if (cursor && cursorCreatedAt && cursorId) {
      // Paginating with cursor: use direction
      if (direction === "after") {
        // Load newer messages: WHERE (created_at, id) > (cursor)
        query = query.or(
          `created_at.gt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.gt.${cursorId})`
        );
        query = query
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
      } else {
        // Load older messages: WHERE (created_at, id) < (cursor)
        query = query.or(
          `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
        );
        query = query
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
      }
    } else {
      // Initial load (no cursor): fetch most recent messages DESC (ChatGPT-style)
      // Client should reverse the array for display (oldest at top, newest at bottom)
      query = query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    }

    query = query.limit(limit);

    const { data: messages, error } = await query;

    if (error) {
      console.error("Error fetching messages:", error);
      return res.status(500).json({ error: "Failed to fetch messages" });
    }

    // Build next/prev cursors
    let nextCursor: string | null = null;
    let prevCursor: string | null = null;

    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const firstMsg = messages[0];

      // Next cursor points to last message (for loading newer messages)
      nextCursor = `${lastMsg.created_at}_${lastMsg.id}`;
      // Prev cursor points to first message (for loading older messages)
      prevCursor = `${firstMsg.created_at}_${firstMsg.id}`;
    }

    res.json({
      messages: messages || [],
      pagination: {
        limit,
        next_cursor: messages && messages.length === limit ? nextCursor : null,
        prev_cursor: cursor ? prevCursor : null, // Only provide prev if we used a cursor
        has_more: messages ? messages.length === limit : false,
      },
    });
  } catch (err: any) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Create a new message in a conversation
 */
export const createMessage = async (req: AuthRequest, res: Response) => {
  try {
    // TEMPORARY: Skip auth check for testing - RE-ENABLE BEFORE PRODUCTION!
    // if (!req.userId) {
    //   return res.status(401).json({ error: "Unauthorized" });
    // }

    const { conversationId } = req.params;
    const { role, content } = req.body;

    // Validate input
    if (!role || !content) {
      return res.status(400).json({ error: "role and content are required" });
    }

    if (!["user", "assistant", "system"].includes(role)) {
      return res
        .status(400)
        .json({ error: "role must be 'user', 'assistant', or 'system'" });
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "content must be a non-empty string" });
    }

    if (content.length > 10000) {
      return res
        .status(400)
        .json({ error: "content must be 10,000 characters or less" });
    }

    // Verify conversation exists (auth check disabled for testing)
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      // .eq("user_id", req.userId) // TEMPORARY: Disabled for testing
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Create message
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating message:", error);
      return res.status(500).json({ error: "Failed to create message" });
    }

    res.status(201).json({ message });
  } catch (err: any) {
    console.error("Create message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Delete a specific message
 */
export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    // TEMPORARY: Skip auth check for testing - RE-ENABLE BEFORE PRODUCTION!
    // if (!req.userId) {
    //   return res.status(401).json({ error: "Unauthorized" });
    // }

    const { conversationId, messageId } = req.params;

    // Verify conversation exists (auth check disabled for testing)
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      // .eq("user_id", req.userId) // TEMPORARY: Disabled for testing
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Delete the message
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", messageId)
      .eq("conversation_id", conversationId);

    if (error) {
      console.error("Error deleting message:", error);
      return res.status(404).json({ error: "Message not found" });
    }

    res.json({ message: "Message deleted successfully" });
  } catch (err: any) {
    console.error("Delete message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Stream AI response using Server-Sent Events (SSE)
 * POST /conversations/:conversationId/messages/stream
 *
 * Request body: { content: string, role?: "user" }
 *
 * SSE Event types:
 * - token: { type: "token", content: "chunk" }
 * - done: { type: "done", messageId: "uuid" }
 * - error: { type: "error", error: "message" }
 *
 * Flow:
 * 1. Save user message to DB
 * 2. Call AI service (streaming) with abort support
 * 3. Stream each token to client via SSE
 * 4. Save complete AI response to DB (only if successful)
 * 5. Send done event with messageId
 *
 * Error handling:
 * - On AI error: send error event, end response, don't persist partial assistant message
 * - On client disconnect: abort AI stream and cleanup
 */
export const streamMessage = async (req: AuthRequest, res: Response) => {
  // AbortController for canceling AI stream on client disconnect
  const abortController = new AbortController();
  let streamingStarted = false;

  try {
    // TEMPORARY: Skip auth check for testing - RE-ENABLE BEFORE PRODUCTION!
    // if (!req.userId) {
    //   return res.status(401).json({ error: "Unauthorized" });
    // }

    const { conversationId } = req.params;
    const { content, role = "user" } = req.body;

    // Validate input
    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "content is required" });
    }

    if (content.length > 10000) {
      return res.status(400).json({ error: "content too long (max 10000)" });
    }

    // Verify conversation exists (auth check disabled for testing)
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      // .eq("user_id", req.userId) // TEMPORARY: Disabled for testing
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Handle client disconnect: abort AI stream
    res.on("close", () => {
      console.log(
        `[SSE] Client disconnected from conversation ${conversationId}`
      );
      abortController.abort();
    });

    // Helper to send SSE events with backpressure handling
    const sendEvent = async (data: StreamChunk): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Check if response is still writable
        if (res.writableEnded || res.destroyed) {
          reject(new Error("Response stream closed"));
          return;
        }

        const success = res.write(`data: ${JSON.stringify(data)}\n\n`);

        if (success) {
          resolve();
        } else {
          // Backpressure: wait for drain event
          res.once("drain", () => resolve());
          // Timeout after 5s to prevent hanging
          setTimeout(() => reject(new Error("Write timeout")), 5000);
        }
      });
    };

    // Save user message first
    const { data: userMessage, error: userMsgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role,
        content,
      })
      .select()
      .single();

    if (userMsgError || !userMessage) {
      await sendEvent({ type: "error", error: "Failed to save user message" });
      return res.end();
    }

    // Send user message saved event
    await sendEvent({ type: "done", messageId: userMessage.id });

    streamingStarted = true;

    // Call AI service with streaming (wrapped in try-catch)
    let aiResponse: string;
    try {
      aiResponse = await streamAIResponse(
        {
          conversationId,
          prompt: content,
          signal: abortController.signal, // Pass abort signal for cancellation
          // Optional: Add message history for context
          // messageHistory: previousMessages,
        },
        sendEvent
      );
    } catch (aiError: any) {
      console.error("[SSE] AI streaming error:", aiError);

      // Determine error message
      let errorMessage = "AI service unavailable";
      if (aiError.message?.includes("OPENAI_API_KEY")) {
        errorMessage = "AI service not configured";
      } else if (aiError.code === "ECONNREFUSED") {
        errorMessage = "Cannot connect to AI service";
      } else if (aiError.status === 429) {
        errorMessage = "AI service rate limit exceeded";
      } else if (aiError.status >= 500) {
        errorMessage = "AI service temporarily unavailable";
      }

      // Send error event to client
      await sendEvent({ type: "error", error: errorMessage });
      return res.end();
    }

    // Check if aborted during streaming
    if (abortController.signal.aborted) {
      console.log("[SSE] Stream aborted, not persisting assistant message");
      return res.end();
    }

    // Save AI assistant response to database (only on success)
    const { data: assistantMessage, error: assistantMsgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: aiResponse,
      })
      .select()
      .single();

    if (assistantMsgError || !assistantMessage) {
      console.error(
        "[SSE] Failed to save assistant message:",
        assistantMsgError
      );
      await sendEvent({ type: "error", error: "Failed to save AI response" });
      return res.end();
    }

    // Send final done event with AI message ID
    await sendEvent({ type: "done", messageId: assistantMessage.id });
    res.end();
  } catch (err: any) {
    console.error("[SSE] Stream message error:", err);

    // Only try to send error if streaming was started and connection is open
    if (streamingStarted && !res.writableEnded && !res.destroyed) {
      try {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            error: "Internal server error",
          })}\n\n`
        );
      } catch (writeError) {
        console.error("[SSE] Failed to write error event:", writeError);
      }
    }

    // Ensure response is ended
    if (!res.writableEnded) {
      res.end();
    }
  }
};
