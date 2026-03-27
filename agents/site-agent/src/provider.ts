export interface DeployResult {
  url: string;
  status: string;
  buildId: string;
}

export interface DeployConfig {
  framework?: string;
  env?: Record<string, string>;
}

export interface DeployProvider {
  name: string;
  deploy(projectPath: string, config?: DeployConfig): Promise<DeployResult>;
}

export interface RepoResult {
  repoUrl: string;
  cloneUrl: string;
}

export interface RepoOptions {
  private?: boolean;
  description?: string;
}

export interface RepoProvider {
  name: string;
  createRepo(name: string, options?: RepoOptions): Promise<RepoResult>;
}
