export type TaskStatus = "queued" | "running" | "success" | "failed" | "partial";

export interface ArtifactRef {
  type: string;
  path: string;
}

export interface AgentTask<TInput = unknown> {
  taskId: string;
  workflow: string;
  agent: string;
  input: TInput;
  context?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

export interface AgentResult<TOutput = unknown> {
  taskId?: string;
  agent: string;
  status: TaskStatus;
  output?: TOutput;
  artifacts?: ArtifactRef[];
  errors?: string[];
}
