import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: "admin" | "operator" | "viewer";
  };
}

export function authMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // In production, validate JWT here
    // For now, decode a simple role from the token
    req.user = {
      id: "user_default",
      role: token === "admin" ? "admin" : token === "operator" ? "operator" : "viewer",
    };
  } else {
    // Default to viewer for unauthenticated requests (dev mode)
    req.user = {
      id: "anonymous",
      role: "viewer",
    };
  }

  next();
}

export function requireRole(...roles: Array<"admin" | "operator" | "viewer">) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: { message: "Forbidden", statusCode: 403 } });
      return;
    }
    next();
  };
}
