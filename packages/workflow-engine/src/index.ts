import type { AgentName, RunStatus } from "@packages/shared-types";

// ── Interfaces ──

export interface WorkflowStage {
  name: string;
  agent: AgentName;
  dependsOn?: string[];
}

export interface WorkflowDefinition {
  name: string;
  stages: WorkflowStage[];
}

export interface StageResult {
  stage: string;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

export interface WorkflowExecution {
  executionId: string;
  workflow: WorkflowDefinition;
  status: RunStatus;
  stageResults: Map<string, StageResult>;
}

// ── Engine ──

let executionCounter = 0;

export class WorkflowEngine {
  createExecution(definition: WorkflowDefinition): WorkflowExecution {
    executionCounter += 1;
    const execution: WorkflowExecution = {
      executionId: `exec_${Date.now()}_${executionCounter}`,
      workflow: definition,
      status: "pending",
      stageResults: new Map(),
    };

    for (const stage of definition.stages) {
      execution.stageResults.set(stage.name, {
        stage: stage.name,
        status: "pending",
      });
    }

    return execution;
  }

  getNextStages(execution: WorkflowExecution): WorkflowStage[] {
    return execution.workflow.stages.filter((stage) => {
      const result = execution.stageResults.get(stage.name);
      if (!result || result.status !== "pending") return false;

      // All dependencies must be completed
      if (stage.dependsOn && stage.dependsOn.length > 0) {
        return stage.dependsOn.every((dep) => {
          const depResult = execution.stageResults.get(dep);
          return depResult?.status === "completed";
        });
      }
      return true;
    });
  }

  markStageComplete(execution: WorkflowExecution, stageName: string, result: unknown): void {
    const stageResult = execution.stageResults.get(stageName);
    if (!stageResult) throw new Error(`Stage "${stageName}" not found in execution.`);

    stageResult.status = "completed";
    stageResult.completedAt = new Date().toISOString();
    stageResult.result = result;

    this.updateExecutionStatus(execution);
  }

  markStageFailed(execution: WorkflowExecution, stageName: string, error: string): void {
    const stageResult = execution.stageResults.get(stageName);
    if (!stageResult) throw new Error(`Stage "${stageName}" not found in execution.`);

    stageResult.status = "failed";
    stageResult.completedAt = new Date().toISOString();
    stageResult.error = error;

    execution.status = "failed";
  }

  isComplete(execution: WorkflowExecution): boolean {
    for (const [, result] of execution.stageResults) {
      if (result.status !== "completed" && result.status !== "failed") {
        return false;
      }
    }
    return true;
  }

  private updateExecutionStatus(execution: WorkflowExecution): void {
    const allDone = this.isComplete(execution);
    if (!allDone) {
      execution.status = "running";
      return;
    }

    const hasFailed = [...execution.stageResults.values()].some((r) => r.status === "failed");
    execution.status = hasFailed ? "failed" : "completed";
  }
}

// ── Predefined workflows ──

export const RESEARCH_CONTENT_WORKFLOW: WorkflowDefinition = {
  name: "research-content",
  stages: [
    { name: "research", agent: "research-agent" },
    { name: "content", agent: "content-agent", dependsOn: ["research"] },
    { name: "media", agent: "media-agent", dependsOn: ["content"] },
    { name: "qa", agent: "qa-agent", dependsOn: ["content", "media"] },
  ],
};

export const SITE_BUILD_WORKFLOW: WorkflowDefinition = {
  name: "site-build",
  stages: [
    { name: "research", agent: "research-agent" },
    { name: "content", agent: "content-agent", dependsOn: ["research"] },
    { name: "site", agent: "site-agent", dependsOn: ["content"] },
    { name: "media", agent: "media-agent", dependsOn: ["content"] },
    { name: "qa", agent: "qa-agent", dependsOn: ["site", "media"] },
  ],
};

export const MEDIA_ONLY_WORKFLOW: WorkflowDefinition = {
  name: "media-only",
  stages: [
    { name: "media", agent: "media-agent" },
    { name: "qa", agent: "qa-agent", dependsOn: ["media"] },
  ],
};
