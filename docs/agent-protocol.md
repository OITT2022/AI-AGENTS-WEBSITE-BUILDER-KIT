# Agent Protocol

## Input
```json
{
  "taskId": "task_001",
  "workflow": "site_build",
  "agent": "research-agent",
  "input": {"prompt": "Research competitors", "language": "he"},
  "context": {"projectId": "proj_001", "artifacts": []},
  "constraints": {"maxSources": 10, "strictCitation": true}
}
```

## Output
```json
{
  "taskId": "task_001",
  "agent": "research-agent",
  "status": "success",
  "output": {"summary": "Top findings", "confidence": 0.82},
  "artifacts": [{"type": "research-pack", "path": "artifacts/research/task_001.json"}],
  "errors": []
}
```
