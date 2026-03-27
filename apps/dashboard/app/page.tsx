import StatusBadge from "./components/StatusBadge";

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
];

export default function HomePage() {
  return (
    <main className="page-container">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your multi-agent orchestration system</p>
      </div>

      {/* Stats cards */}
      <div className="card-grid section">
        <div className="card stat-card">
          <span className="label">Total Runs</span>
          <span className="value">24</span>
        </div>
        <div className="card stat-card">
          <span className="label">Active Tasks</span>
          <span className="value">3</span>
        </div>
        <div className="card stat-card">
          <span className="label">Agents Available</span>
          <span className="value">5</span>
        </div>
        <div className="card stat-card">
          <span className="label">Success Rate</span>
          <span className="value">87%</span>
        </div>
      </div>

      {/* Recent runs */}
      <div className="section">
        <h2 className="section-title">Recent Runs</h2>
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Created</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
