import StatusBadge from "../components/StatusBadge";

const envVars = [
  { name: "OPENAI_API_KEY", configured: true },
  { name: "ANTHROPIC_API_KEY", configured: true },
  { name: "PERPLEXITY_API_KEY", configured: false },
  { name: "GOOGLE_AI_API_KEY", configured: false },
  { name: "DATABASE_URL", configured: false },
];

const agents = [
  { name: "research-agent", description: "Web research and source aggregation", status: "active" },
  { name: "content-agent", description: "Content generation and copywriting", status: "active" },
  { name: "site-agent", description: "Website scaffolding and deployment", status: "active" },
  { name: "media-agent", description: "Image, chart, and video generation", status: "inactive" },
  { name: "qa-agent", description: "Quality assurance and validation", status: "active" },
];

const endpoints = [
  { method: "GET", path: "/health", description: "Health check" },
  { method: "POST", path: "/runs", description: "Create a workflow run" },
  { method: "GET", path: "/runs", description: "List all runs" },
  { method: "GET", path: "/runs/:runId", description: "Get run details" },
  { method: "POST", path: "/tasks", description: "Submit a task" },
  { method: "GET", path: "/tasks", description: "List all tasks" },
  { method: "GET", path: "/tasks/:taskId", description: "Get task details" },
  { method: "PATCH", path: "/tasks/:taskId", description: "Update task status" },
];

export default function SettingsPage() {
  return (
    <main className="page-container">
      <div className="page-header">
        <h1>Settings</h1>
        <p>System configuration and environment status</p>
      </div>

      {/* Environment variables */}
      <div className="section">
        <h2 className="section-title">Environment Variables</h2>
        <div className="settings-list">
          {envVars.map((v) => (
            <div key={v.name} className="settings-item">
              <span className="name mono">{v.name}</span>
              <span className="status">
                {v.configured ? (
                  <StatusBadge status="success" />
                ) : (
                  <StatusBadge status="pending" />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Agents */}
      <div className="section">
        <h2 className="section-title">Agents</h2>
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.name}>
                    <td className="mono">{agent.name}</td>
                    <td>{agent.description}</td>
                    <td>
                      <StatusBadge
                        status={agent.status === "active" ? "completed" : "pending"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* API Endpoints */}
      <div className="section">
        <h2 className="section-title">API Endpoints</h2>
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => (
                  <tr key={`${ep.method}-${ep.path}`}>
                    <td>
                      <span
                        className="badge badge-info"
                        style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}
                      >
                        {ep.method}
                      </span>
                    </td>
                    <td className="mono">{ep.path}</td>
                    <td>{ep.description}</td>
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
