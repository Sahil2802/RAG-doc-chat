# Authentication Middleware

## Overview

This middleware validates JWT tokens from Supabase and attaches the authenticated user to the request object.

## Usage

### 1. Import the middleware

```typescript
import { authenticate } from "../middleware/auth";
```

### 2. Protect routes

```typescript
// In your route file
router.get("/protected", authenticate, yourController);
router.post("/create", authenticate, createController);
```

### 3. Access user in controller

```typescript
import { AuthRequest } from "../types";

const yourController = async (req: AuthRequest, res: Response) => {
  const userId = req.userId; // User's UUID
  const user = req.user; // Full Supabase User object

  // Your logic here
  res.json({ userId, email: user.email });
};
```

## Middleware Functions

### `authenticate` (required auth)

- Requires valid Bearer token
- Returns 401 if token is missing or invalid
- Attaches `req.user` and `req.userId`

### `optionalAuth` (optional auth)

- Accepts requests with or without token
- If token provided and valid, attaches `req.user`
- Never blocks the request

## Example Request

```bash
# With Postman or curl
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer eyJhbGci..."
```

## How It Works

1. **Extract token** from `Authorization: Bearer <token>` header
2. **Validate** with Supabase `auth.getUser(token)`
3. **Attach user** to `req.user` and `req.userId`
4. **Continue** to next middleware/controller

## Error Responses

### Missing Authorization header

```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header. Expected format: 'Bearer <token>'"
}
```

### Invalid/expired token

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

## Example Protected Endpoint

File: `src/routes/auth.ts`

```typescript
import { authenticate } from "../middleware/auth";
import { getCurrentUser } from "../controllers/auth";

router.get("/me", authenticate, getCurrentUser);
```

File: `src/controllers/auth.ts`

```typescript
import { AuthRequest } from "../types";

const getCurrentUser = async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
    },
  });
};
```

## Testing

### 1. Sign in to get token

```bash
POST http://localhost:3000/auth/signin
{
  "email": "user@example.com",
  "password": "password"
}

# Response includes access_token
```

### 2. Use token in protected route

```bash
GET http://localhost:3000/auth/me
Authorization: Bearer <access_token_from_signin>
```

### Expected response

```json
{
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "created_at": "2025-10-14T12:00:00Z",
    "updated_at": "2025-10-14T12:00:00Z"
  }
}
```
