import { Request, Response } from "express";
import supabase from "../services/supabase";
import { AuthRequest } from "../types";

const signup = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.json({ data });
};

const signin = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.json({ data });
};

// Protected route: Get current authenticated user
const getCurrentUser = async (req: AuthRequest, res: Response) => {
  // User is already attached by authenticate middleware
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      created_at: req.user.created_at,
      updated_at: req.user.updated_at,
    },
  });
};

export { signup, signin, getCurrentUser };
