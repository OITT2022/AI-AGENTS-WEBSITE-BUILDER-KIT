import type { Request, Response, NextFunction } from "express";

export interface ApiError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.message || "Internal Server Error";

  console.error(`[error] ${statusCode} – ${message}`, err.stack);

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
    },
  });
}
