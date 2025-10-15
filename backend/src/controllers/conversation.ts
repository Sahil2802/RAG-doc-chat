import { Response } from "express";
import supabase from "../services/supabase";
import { AuthRequest } from "../types";

// Local type for rows returned from the DB for conversations
type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  // Postgres client may return number, string, null or undefined depending on driver/version
  message_count?: number | string | null;
};

/**
 * Get all conversations for the authenticated user
 * Ordered by most recent activity (updated_at DESC)
 */
export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Query conversations with denormalized message_count
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select(
        `
        id,
        title,
        created_at,
        updated_at,
        message_count
      `
      )
      .eq("user_id", req.userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      return res.status(500).json({ error: "Failed to fetch conversations" });
    }

    // Format response (message_count is denormalized on conversations)
    const formattedConversations = (conversations as ConversationRow[]).map(
      (conv) => {
        const raw = conv?.message_count;
        const num = Number(raw);
        const message_count = Number.isFinite(num) ? num : 0;

        return {
          id: conv.id,
          title: conv.title,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          message_count,
        };
      }
    );

    res.json({ conversations: formattedConversations });
  } catch (err: any) {
    console.error("Get conversations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Get a single conversation by ID
 */
export const getConversation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    const { data: conversation, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.userId)
      .single();

    if (error || !conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ conversation });
  } catch (err: any) {
    console.error("Get conversation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Create a new conversation
 */
export const createConversation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { title } = req.body;

    // Validate title if provided
    if (title && typeof title !== "string") {
      return res.status(400).json({ error: "Title must be a string" });
    }

    if (title && title.length > 100) {
      return res
        .status(400)
        .json({ error: "Title must be 100 characters or less" });
    }

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        user_id: req.userId,
        title: title || "New Chat",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating conversation:", error);
      return res.status(500).json({ error: "Failed to create conversation" });
    }

    res.status(201).json({ conversation });
  } catch (err: any) {
    console.error("Create conversation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Update conversation (title)
 */
export const updateConversation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== "string") {
      return res
        .status(400)
        .json({ error: "Title is required and must be a string" });
    }

    if (title.length > 100) {
      return res
        .status(400)
        .json({ error: "Title must be 100 characters or less" });
    }

    // Check ownership and update
    const { data: conversation, error } = await supabase
      .from("conversations")
      .update({ title })
      .eq("id", id)
      .eq("user_id", req.userId)
      .select()
      .single();

    if (error || !conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ conversation });
  } catch (err: any) {
    console.error("Update conversation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Delete a conversation (cascade deletes messages via DB)
 */
export const deleteConversation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Check ownership and delete
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", req.userId);

    if (error) {
      console.error("Error deleting conversation:", error);
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ message: "Conversation deleted successfully" });
  } catch (err: any) {
    console.error("Delete conversation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
