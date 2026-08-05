import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, "NOT_FOUND", "Route not found"));
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const requestId = randomUUID();

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId,
        timestamp: new Date().toISOString(),
        details: error.details,
      },
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        requestId,
        timestamp: new Date().toISOString(),
        details: error.flatten(),
      },
    });
  }

  if (error && typeof error === "object" && ("type" in error && error.type === "entity.too.large" || "status" in error && error.status === 413)) {
    return res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Payload size exceeds maximum allowed limit",
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  console.error({ requestId, error });
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Unhandled server error",
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
}
