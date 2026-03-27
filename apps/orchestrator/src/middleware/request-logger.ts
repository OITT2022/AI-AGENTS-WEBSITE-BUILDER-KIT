import type { Request, Response, NextFunction } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logEntry = {
      level: "info",
      message: "request",
      timestamp: new Date().toISOString(),
      service: "orchestrator",
      meta: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userAgent: req.headers["user-agent"],
      },
    };
    console.log(JSON.stringify(logEntry));
  });

  next();
}
