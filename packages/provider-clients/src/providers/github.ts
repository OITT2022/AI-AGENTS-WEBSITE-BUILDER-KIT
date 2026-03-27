import { createHttpClient, type HttpClient } from "../index.js";

export interface CreateRepoOptions {
  private?: boolean;
  description?: string;
}

export interface CreateRepoResult {
  repoUrl: string;
  cloneUrl: string;
}

interface GitHubRepoResponse {
  html_url?: string;
  clone_url?: string;
}

interface GitHubRefResponse {
  object?: { sha?: string };
}

interface GitHubTreeItem {
  sha?: string;
}

interface GitHubTreeResponse {
  sha?: string;
}

interface GitHubCommitResponse {
  sha?: string;
}

export class GitHubClient {
  private readonly client: HttpClient;

  constructor(
    private readonly token: string,
    private readonly owner?: string,
  ) {
    this.client = createHttpClient("https://api.github.com", {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
  }

  async createRepo(
    name: string,
    options?: CreateRepoOptions,
  ): Promise<CreateRepoResult> {
    const body: Record<string, unknown> = {
      name,
      private: options?.private ?? false,
    };
    if (options?.description) {
      body["description"] = options.description;
    }

    const endpoint = this.owner
      ? `/orgs/${this.owner}/repos`
      : "/user/repos";

    const response = await this.client.post<GitHubRepoResponse>(endpoint, body);

    return {
      repoUrl: response.html_url ?? "",
      cloneUrl: response.clone_url ?? "",
    };
  }

  async pushFiles(
    repo: string,
    files: Array<{ path: string; content: string }>,
    message?: string,
  ): Promise<void> {
    const owner = this.owner ?? (await this.getAuthenticatedUser());
    const commitMessage = message ?? "Add files";

    // Get the reference to HEAD
    const ref = await this.client.get<GitHubRefResponse>(
      `/repos/${owner}/${repo}/git/ref/heads/main`,
    );
    const baseSha = ref.object?.sha ?? "";

    // Create blobs for each file
    const treeItems: Array<{
      path: string;
      mode: string;
      type: string;
      sha: string;
    }> = [];

    for (const file of files) {
      const blob = await this.client.post<GitHubTreeItem>(
        `/repos/${owner}/${repo}/git/blobs`,
        { content: file.content, encoding: "utf-8" },
      );
      treeItems.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha ?? "",
      });
    }

    // Create tree
    const tree = await this.client.post<GitHubTreeResponse>(
      `/repos/${owner}/${repo}/git/trees`,
      { base_tree: baseSha, tree: treeItems },
    );

    // Create commit
    const commit = await this.client.post<GitHubCommitResponse>(
      `/repos/${owner}/${repo}/git/commits`,
      {
        message: commitMessage,
        tree: tree.sha ?? "",
        parents: [baseSha],
      },
    );

    // Update reference
    await this.client.post(`/repos/${owner}/${repo}/git/refs/heads/main`, {
      sha: commit.sha ?? "",
    });
  }

  async createWebhook(
    repo: string,
    url: string,
    events?: string[],
  ): Promise<void> {
    const owner = this.owner ?? (await this.getAuthenticatedUser());

    await this.client.post(`/repos/${owner}/${repo}/hooks`, {
      config: {
        url,
        content_type: "json",
      },
      events: events ?? ["push"],
      active: true,
    });
  }

  private async getAuthenticatedUser(): Promise<string> {
    const user = await this.client.get<{ login?: string }>("/user");
    return user.login ?? "";
  }
}
