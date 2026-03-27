import { createHttpClient, type HttpClient } from "../index.js";

export interface DeploySource {
  type: "github";
  repoUrl: string;
}

export interface DeployResult {
  deploymentId: string;
  url: string;
}

export interface DeploymentStatus {
  status: string;
  url: string;
  readyAt?: string;
}

interface VercelDeployResponse {
  id?: string;
  url?: string;
}

interface VercelDeploymentResponse {
  readyState?: string;
  url?: string;
  ready?: number;
}

export class VercelClient {
  private readonly client: HttpClient;

  constructor(
    private readonly token: string,
    private readonly teamId?: string,
  ) {
    this.client = createHttpClient("https://api.vercel.com", {
      Authorization: `Bearer ${this.token}`,
    });
  }

  private queryParams(): Record<string, string> {
    if (this.teamId) {
      return { teamId: this.teamId };
    }
    return {};
  }

  async deploy(
    projectId: string,
    source: DeploySource,
  ): Promise<DeployResult> {
    const params = this.queryParams();
    const qs = new URLSearchParams(params).toString();
    const path = `/v13/deployments${qs ? `?${qs}` : ""}`;

    const body = {
      name: projectId,
      project: projectId,
      gitSource: {
        type: source.type,
        repoUrl: source.repoUrl,
        ref: "main",
      },
    };

    const response = await this.client.post<VercelDeployResponse>(path, body);

    return {
      deploymentId: response.id ?? "",
      url: response.url ? `https://${response.url}` : "",
    };
  }

  async getDeployment(deploymentId: string): Promise<DeploymentStatus> {
    const params = this.queryParams();
    const qs = new URLSearchParams(params).toString();
    const path = `/v13/deployments/${deploymentId}${qs ? `?${qs}` : ""}`;

    const response = await this.client.get<VercelDeploymentResponse>(path);

    return {
      status: response.readyState ?? "UNKNOWN",
      url: response.url ? `https://${response.url}` : "",
      readyAt: response.ready
        ? new Date(response.ready).toISOString()
        : undefined,
    };
  }
}
