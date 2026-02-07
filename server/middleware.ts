import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const existing = req.header("x-request-id");
  const id = existing || crypto.randomUUID();

  res.setHeader("X-Request-Id", id);
  (req as any).requestId = id;

  next();
}

export function timingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = performance.now();

  res.on("finish", () => {
    const ms = (performance.now() - start).toFixed(1);
    const id = (req as any).requestId ? ` rid=${(req as any).requestId}` : "";
    console.log(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} (${ms}ms)${id}`);
  });

  next();
}

export function basicRateLimit(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs ?? 60_000;
  const max = options?.max ?? 60;

  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || "unknown";
    const now = Date.now();

    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Try again soon.",
      });
      return;
    }

    next();
  };
}
