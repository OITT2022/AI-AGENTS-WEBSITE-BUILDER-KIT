import crypto from "node:crypto";
import type {
  AgentTask,
  Run,
  RunStatus,
  TaskStatus,
  WorkflowType,
} from "@packages/shared-types";

export interface StoredTask extends AgentTask {
  status: TaskStatus;
  result?: unknown;
  runId: string;
  createdAt: string;
  updatedAt: string;
}

export class OrchestrationService {
  private runs = new Map<string, Run>();
  private tasks = new Map<string, StoredTask>();

  createRun(workflow: WorkflowType, input: unknown): Run {
    const now = new Date().toISOString();
    const run: Run = {
      runId: crypto.randomUUID(),
      workflow,
      status: "pending",
      tasks: [],
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.runId, run);
    return run;
  }

  submitTask(runId: string, task: Omit<AgentTask, "taskId">): string {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();

    const fullTask: AgentTask = { ...task, taskId };
    const storedTask: StoredTask = {
      ...fullTask,
      status: "queued",
      runId,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(taskId, storedTask);
    run.tasks.push(fullTask);
    run.status = "running";
    run.updatedAt = now;

    return taskId;
  }

  updateTaskStatus(taskId: string, status: TaskStatus, result?: unknown): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = status;
    task.updatedAt = new Date().toISOString();
    if (result !== undefined) {
      task.result = result;
    }

    // Update run status based on tasks
    const run = this.runs.get(task.runId);
    if (run) {
      const runTasks = this.listTasks(task.runId);
      const allDone = runTasks.every(
        (t) => t.status === "success" || t.status === "failed",
      );
      if (allDone) {
        const anyFailed = runTasks.some((t) => t.status === "failed");
        run.status = anyFailed ? "failed" : "completed";
      }
      run.updatedAt = new Date().toISOString();
    }
  }

  getRun(runId: string): Run | undefined {
    return this.runs.get(runId);
  }

  listRuns(): Run[] {
    return Array.from(this.runs.values());
  }

  getTask(taskId: string): StoredTask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(runId?: string): StoredTask[] {
    const all = Array.from(this.tasks.values());
    if (runId) {
      return all.filter((t) => t.runId === runId);
    }
    return all;
  }
}

export const orchestrationService = new OrchestrationService();
