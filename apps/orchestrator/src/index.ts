import express from "express";
import { tasksRouter } from "./routes/tasks.js";
import { runsRouter } from "./routes/runs.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authMiddleware } from "./middleware/auth.js";
import { requestLogger } from "./middleware/request-logger.js";

const app = express();

// ── Body parsing ──
app.use(express.json());

// ── Logging ──
app.use(requestLogger);

// ── Auth ──
app.use(authMiddleware);

// ── CORS headers ──
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// ── Health check ──
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "orchestrator", uptime: process.uptime() });
});

// ── Routes ──
app.use("/tasks", tasksRouter);
app.use("/runs", runsRouter);

// ── Error handling (must be last) ──
app.use(errorHandler);

// ── Start server ──
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`orchestrator listening on ${port}`);
});
