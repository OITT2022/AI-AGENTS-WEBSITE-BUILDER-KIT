import { type Router as RouterType, Router } from "express";
import { z } from "zod";
import { orchestrationService } from "../services/orchestration.js";
import type { ApiError } from "../middleware/error-handler.js";

const createRunSchema = z.object({
  workflow: z.enum(["research-content", "site-build", "media-only"]),
  input: z.unknown(),
});

export const runsRouter: RouterType = Router();

// POST /runs — create a new workflow run
runsRouter.post("/", (req, res, next) => {
  try {
    const parsed = createRunSchema.safeParse(req.body);
    if (!parsed.success) {
      const err: ApiError = new Error(
        `Validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
      err.statusCode = 400;
      next(err);
      return;
    }

    const run = orchestrationService.createRun(
      parsed.data.workflow,
      parsed.data.input,
    );
    res.status(201).json({ run });
  } catch (err) {
    next(err);
  }
});

// GET /runs — list all runs
runsRouter.get("/", (_req, res) => {
  const runs = orchestrationService.listRuns();
  res.json({ runs });
});

// GET /runs/:runId — get run details including task statuses
runsRouter.get("/:runId", (req, res, next) => {
  const run = orchestrationService.getRun(req.params.runId);
  if (!run) {
    const err: ApiError = new Error(`Run not found: ${req.params.runId}`);
    err.statusCode = 404;
    next(err);
    return;
  }

  const tasks = orchestrationService.listTasks(req.params.runId);
  res.json({ run, tasks });
});
