import { Response, NextFunction } from "express";
import supabase from "../services/supabase";
import { AuthRequest } from "../types";

/**
 * Auth Middleware
 * Extracts Bearer token from Authorization header,
 * validates it with Supabase, and attaches user to request
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
        message:
          "Missing or invalid Authorization header. Expected format: 'Bearer <token>'",
      });
    }

    // Extract the token (remove 'Bearer ' prefix)
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Token is missing",
      });
    }

    // Validate token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: error?.message || "Invalid or expired token",
      });
    }

    // Attach user to request object
    req.user = data.user;
    req.userId = data.user.id;

    // Proceed to next middleware or route handler
    next();
  } catch (err: any) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to authenticate user",
    });
  }
};

/**
 * Optional middleware: check if user is authenticated but don't require it
 * Useful for routes that behave differently for authenticated vs anonymous users
 */
// export const optionalAuth = async (
//   req: AuthRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const authHeader = req.headers.authorization;

//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       // No token provided, continue without user
//       return next();
//     }

//     const token = authHeader.substring(7);

//     if (!token) {
//       return next();
//     }

//     const { data, error } = await supabase.auth.getUser(token);

//     if (!error && data.user) {
//       req.user = data.user;
//       req.userId = data.user.id;
//     }

//     next();
//   } catch (err: any) {
//     console.error("Optional auth middleware error:", err);
//     // Don't block request, just continue without user
//     next();
//   }
// };
