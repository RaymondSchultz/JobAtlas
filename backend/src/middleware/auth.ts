import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { ApiError } from "../errors.js";

export type AuthRole = "visitor" | "user" | "admin" | "system";

export interface AuthUser {
  id: string;
  role: AuthRole;
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireInternalServiceKey(req: Request, _res: Response, next: NextFunction) {
  const serviceKey = req.header("X-Service-Key");
  if (!config.internalServiceKey || serviceKey !== config.internalServiceKey) {
    throw new ApiError(401, "INVALID_SERVICE_KEY", "Invalid internal service key");
  }
  req.user = { id: "system", role: "system" };
  next();
}

export function requireJwt(requiredRole: AuthRole = "user") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new ApiError(401, "UNAUTHORIZED", "Missing bearer token");
    }

    try {
      const payload = jwt.verify(header.slice("Bearer ".length), config.jwtSecret) as AuthUser;
      req.user = payload;
      if (requiredRole === "admin" && payload.role !== "admin") {
        throw new ApiError(403, "FORBIDDEN", "Admin role required");
      }
      next();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired bearer token");
    }
  };
}
