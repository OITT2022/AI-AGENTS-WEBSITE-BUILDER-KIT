// ── Existing types ──

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

// ── Core enums / union types ──

export type WorkflowType = "research-content" | "site-build" | "media-only";

export type AgentName =
  | "research-agent"
  | "content-agent"
  | "site-agent"
  | "media-agent"
  | "qa-agent";

export type RunStatus = "pending" | "running" | "completed" | "failed";

// ── Run & event types ──

export interface Run {
  runId: string;
  workflow: WorkflowType;
  status: RunStatus;
  tasks: AgentTask[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskEvent {
  taskId: string;
  agent: AgentName;
  event: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ── Provider config ──

export interface ProviderConfig {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  options?: Record<string, unknown>;
}

// ── Content types ──

export type ContentType = "article" | "landing-copy" | "seo-snippet" | "social-snippet";

export type Language = "he" | "en" | "ar";

// ── Research agent ──

export interface ResearchInput {
  prompt: string;
  language: Language;
  providers?: string[];
  domains?: string[];
  maxSources?: number;
}

export interface Finding {
  title: string;
  detail: string;
  relevance?: number;
}

export interface Source {
  provider: string;
  url: string;
  title?: string;
  confidence?: number;
}

export interface ResearchOutput {
  summary: string;
  findings: Finding[];
  sources: Source[];
  confidence: number;
}

// ── Content agent ──

export interface ContentInput {
  type: ContentType;
  topic: string;
  language: Language;
  keywords?: string[];
  tone?: string;
}

export interface ContentOutput {
  content: string;
  language: Language;
  wordCount: number;
  seoScore?: number;
}

// ── Site agent ──

export interface SiteInput {
  brief: string;
  language: Language;
  framework?: string;
  database?: string;
}

export interface SiteOutput {
  repoUrl?: string;
  deployUrl?: string;
  pages: string[];
}

// ── Media agent ──

export interface MediaInput {
  type: "image" | "chart" | "video";
  prompt: string;
  style?: string;
  dimensions?: { width: number; height: number };
}

export interface MediaOutput {
  url: string;
  type: "image" | "chart" | "video";
  provider: string;
  metadata?: Record<string, unknown>;
}

// ── QA agent ──

export interface QaInput {
  targetUrl: string;
  checks: string[];
}

export interface QaCheckResult {
  check: string;
  passed: boolean;
  details?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

export interface QaOutput {
  passed: boolean;
  results: QaCheckResult[];
}
