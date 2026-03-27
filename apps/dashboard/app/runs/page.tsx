import Link from "next/link";
import StatusBadge from "../components/StatusBadge";

const placeholderRuns = [
  {
    runId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    workflow: "research-content",
    status: "completed",
    createdAt: "2026-03-26T09:15:00Z",
  },
  {
    runId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    workflow: "site-build",
    status: "running",
    createdAt: "2026-03-26T10:30:00Z",
  },
  {
    runId: "c3d4e5f6-a7b8-9012-cdef-123456789012",
    workflow: "media-only",
    status: "failed",
    createdAt: "2026-03-25T14:22:00Z",
  },
  {
    runId: "d4e5f6a7-b8c9-0123-defa-234567890123",
    workflow: "research-content",
    status: "pending",
    createdAt: "2026-03-26T11:00:00Z",
  },
  {
    runId: "e5f6a7b8-c9d0-1234-efab-345678901234",
    workflow: "site-build",
    status: "completed",
    createdAt: "2026-03-24T16:45:00Z",
  },
  {
    runId: "f6a7b8c9-d0e1-2345-fabc-456789012345",
    workflow: "media-only",
    status: "completed",
    createdAt: "2026-03-24T08:10:00Z",
  },
];

export default function RunsPage() {
  return (
    <main className="page-container">
      <div className="page-header">
        <h1>Workflow Runs</h1>
        <p>All orchestration runs across workflows</p>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Workflow</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {placeholderRuns.map((run) => (
                <tr key={run.runId}>
                  <td className="mono">{run.runId.slice(0, 8)}</td>
                  <td>{run.workflow}</td>
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="mono">
                    {new Date(run.createdAt).toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td>
                    <Link
                      href={`/runs/${run.runId}`}
                      style={{ fontSize: "0.85rem" }}
                    >
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
