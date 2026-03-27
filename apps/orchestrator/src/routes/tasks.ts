import { type Router as RouterType, Router } from "express";
import { z } from "zod";
import { orchestrationService } from "../services/orchestration.js";
import type { ApiError } from "../middleware/error-handler.js";

const taskBodySchema = z.object({
  runId: z.string().uuid(),
  workflow: z.string().min(1),
  agent: z.string().min(1),
  input: z.unknown(),
  context: z.record(z.unknown()).optional(),
  constraints: z.record(z.unknown()).optional(),
});

const taskPatchSchema = z.object({
  status: z.enum(["queued", "running", "success", "failed", "partial"]),
  result: z.unknown().optional(),
});

export const tasksRouter: RouterType = Router();

// POST /tasks — create a new task
tasksRouter.post("/", (req, res, next) => {
  try {
    const parsed = taskBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err: ApiError = new Error(
        `Validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
      err.statusCode = 400;
      next(err);
      return;
    }

    const { runId, workflow, agent, input, context, constraints } = parsed.data;
    const taskId = orchestrationService.submitTask(runId, {
      workflow,
      agent,
      input,
      context,
      constraints,
    });

    res.status(202).json({ taskId });
  } catch (err) {
    next(err);
  }
});

// GET /tasks — list all tasks
tasksRouter.get("/", (_req, res) => {
  const runId = typeof _req.query.runId === "string" ? _req.query.runId : undefined;
  const tasks = orchestrationService.listTasks(runId);
  res.json({ tasks });
});

// GET /tasks/:taskId — single task
tasksRouter.get("/:taskId", (req, res, next) => {
  const task = orchestrationService.getTask(req.params.taskId);
  if (!task) {
    const err: ApiError = new Error(`Task not found: ${req.params.taskId}`);
    err.statusCode = 404;
    next(err);
    return;
  }
  res.json({ task });
});

// PATCH /tasks/:taskId — update task status
tasksRouter.patch("/:taskId", (req, res, next) => {
  try {
    const parsed = taskPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      const err: ApiError = new Error(
        `Validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
      err.statusCode = 400;
      next(err);
      return;
    }

    orchestrationService.updateTaskStatus(
      req.params.taskId,
      parsed.data.status,
      parsed.data.result,
    );

    const task = orchestrationService.getTask(req.params.taskId);
    res.json({ task });
  } catch (err) {
    next(err);
  }
});
