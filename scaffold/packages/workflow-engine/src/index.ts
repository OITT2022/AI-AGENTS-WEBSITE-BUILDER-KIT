export interface WorkflowStage {
  name: string;
  agent: string;
}

export async function runWorkflow(stages: WorkflowStage[]) {
  return { status: "stub", stages };
}
