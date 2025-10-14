import { Request } from "express";
import { User } from "@supabase/supabase-js";

// Extend Express Request to include authenticated user
export interface AuthRequest extends Request {
  user?: User;
  userId?: string;
}
