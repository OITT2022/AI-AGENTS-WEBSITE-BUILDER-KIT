"use client";

import { useParams } from "next/navigation";
import StatusBadge from "../../components/StatusBadge";

interface PlaceholderTask {
  taskId: string;
  agent: string;
  status: string;
  result: string | null;
}

const placeholderTasksByRun: Record<string, PlaceholderTask[]> = {
  "a1b2c3d4-e5f6-7890-abcd-ef1234567890": [
    { taskId: "t1", agent: "research-agent", status: "success", result: "Found 12 sources on target topic" },
    { taskId: "t2", agent: "content-agent", status: "success", result: "Generated 1,500 word article" },
    { taskId: "t3", agent: "qa-agent", status: "success", result: "All 8 checks passed" },
  ],
  "b2c3d4e5-f6a7-8901-bcde-f12345678901": [
    { taskId: "t4", agent: "research-agent", status: "success", result: "Gathered site requirements" },
    { taskId: "t5", agent: "site-agent", status: "running", result: null },
    { taskId: "t6", agent: "qa-agent", status: "queued", result: null },
  ],
  "c3d4e5f6-a7b8-9012-cdef-123456789012": [
    { taskId: "t7", agent: "media-agent", status: "failed", result: "Provider API returned 503" },
  ],
};

const runMeta: Record<string, { workflow: string; status: string; createdAt: string }> = {
  "a1b2c3d4-e5f6-7890-abcd-ef1234567890": { workflow: "research-content", status: "completed", createdAt: "2026-03-26T09:15:00Z" },
  "b2c3d4e5-f6a7-8901-bcde-f12345678901": { workflow: "site-build", status: "running", createdAt: "2026-03-26T10:30:00Z" },
  "c3d4e5f6-a7b8-9012-cdef-123456789012": { workflow: "media-only", status: "failed", createdAt: "2026-03-25T14:22:00Z" },
};

export default function RunDetailPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;
  const meta = runMeta[runId];
  const tasks = placeholderTasksByRun[runId] ?? [];

  if (!meta) {
    return (
      <main className="page-container">
        <div className="page-header">
          <h1>Run Not Found</h1>
          <p>No run exists with ID: <span className="mono">{runId}</span></p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-container">
      <div className="page-header">
        <h1>Run Details</h1>
        <p>Inspect tasks and results for this workflow run</p>
      </div>

      {/* Run info */}
      <div className="card section" style={{ display: "flex", flexWrap: "wrap", gap: "2rem" }}>
        <div>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
            Run ID
          </div>
          <div className="mono">{runId}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
            Workflow
          </div>
          <div>{meta.workflow}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
            Status
          </div>
          <StatusBadge status={meta.status} />
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
            Created
          </div>
          <div className="mono">
            {new Date(meta.createdAt).toLocaleString("en-GB", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="section">
        <h2 className="section-title">Tasks ({tasks.length})</h2>
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                      No tasks found for this run
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr key={task.taskId}>
                      <td className="mono">{task.taskId}</td>
                      <td>{task.agent}</td>
                      <td>
                        <StatusBadge status={task.status} />
                      </td>
                      <td style={{ color: task.result ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {task.result ?? "Waiting..."}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
