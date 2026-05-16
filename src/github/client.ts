import type { CompareBranch, FileStatus } from "@/src/domain/types";
import type { GitHubRepositoryRef } from "@/src/domain/github-connection";
import { validateSaveBranchFileInput } from "@/src/domain/save-branch-file";

interface GitHubUserResponse {
  login: string;
  id: number;
}

interface GitHubBranchResponse {
  name: string;
  commit: {
    sha: string;
  };
}

interface GitHubRepoResponse {
  name: string;
  private: boolean;
  default_branch: string;
  owner: {
    login: string;
  };
}

interface GitHubCompareResponse {
  files?: Array<{
    filename: string;
    status: "added" | "modified" | "removed" | "renamed";
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

interface GitHubContentsResponse {
  sha: string;
  content?: string;
  encoding?: string;
}

export interface GitHubConnectionSummary {
  viewerLogin: string;
  repository: {
    owner: string;
    name: string;
    isPrivate: boolean;
    defaultBranch: string;
  };
  branches: Array<{
    name: string;
    headSha: string;
  }>;
}

interface GitHubRequestErrorOptions {
  status: number;
  message: string;
}

export class GitHubRequestError extends Error {
  status: number;

  constructor(options: GitHubRequestErrorOptions) {
    super(options.message);
    this.status = options.status;
  }
}

export class GitHubClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string, baseUrl = process.env.GITHUB_API_BASE_URL ?? "https://api.github.com") {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async getViewer(): Promise<{ login: string; id: number }> {
    const user = await this.request<GitHubUserResponse>("/user");
    return {
      login: user.login,
      id: user.id,
    };
  }

  async getRepository(ref: GitHubRepositoryRef): Promise<GitHubConnectionSummary["repository"]> {
    const repo = await this.request<GitHubRepoResponse>(`/repos/${ref.owner}/${ref.name}`);
    return {
      owner: repo.owner.login,
      name: repo.name,
      isPrivate: repo.private,
      defaultBranch: repo.default_branch,
    };
  }

  async listBranches(ref: GitHubRepositoryRef): Promise<GitHubConnectionSummary["branches"]> {
    const branches = await this.request<GitHubBranchResponse[]>(
      `/repos/${ref.owner}/${ref.name}/branches?per_page=100`,
    );

    return branches.map((branch) => ({
      name: branch.name,
      headSha: branch.commit.sha,
    }));
  }

  async buildCompareBranch(
    ref: GitHubRepositoryRef,
    baseBranch: string,
    compareBranch: string,
  ): Promise<CompareBranch> {
    const compare = await this.request<GitHubCompareResponse>(
      `/repos/${ref.owner}/${ref.name}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(compareBranch)}`,
    );

    const branchSha = (await this.getBranchHead(ref, compareBranch)).headSha;
    const files = await Promise.all(
      (compare.files ?? []).map(async (file) => {
        const normalizedStatus: FileStatus =
          file.status === "removed" ? "deleted" : file.status;
        let content = "";

        if (normalizedStatus !== "deleted") {
          const fileContents = await this.getFileContent(ref, compareBranch, file.filename);
          content = fileContents.content;
        }

        return {
          path: file.filename,
          status: normalizedStatus,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch ?? "patch unavailable",
          content,
        };
      }),
    );

    return {
      name: compareBranch,
      headSha: branchSha,
      files,
    };
  }

  async saveBranchFile(options: {
    ref: GitHubRepositoryRef;
    branch: string;
    path: string;
    message: string;
    content: string;
    sha: string;
  }): Promise<void> {
    validateSaveBranchFileInput({
      branch: options.branch,
      path: options.path,
      message: options.message,
    });

    await this.request(
      `/repos/${options.ref.owner}/${options.ref.name}/contents/${encodeURIComponent(options.path)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: options.message,
          content: Buffer.from(options.content, "utf8").toString("base64"),
          branch: options.branch,
          sha: options.sha,
        }),
      },
    );
  }

  async getBranchHead(
    ref: GitHubRepositoryRef,
    branch: string,
  ): Promise<{ name: string; headSha: string }> {
    const branchResponse = await this.request<GitHubBranchResponse>(
      `/repos/${ref.owner}/${ref.name}/branches/${encodeURIComponent(branch)}`,
    );

    return {
      name: branchResponse.name,
      headSha: branchResponse.commit.sha,
    };
  }

  async getFileContent(
    ref: GitHubRepositoryRef,
    branch: string,
    path: string,
  ): Promise<{ sha: string; content: string }> {
    const response = await this.request<GitHubContentsResponse>(
      `/repos/${ref.owner}/${ref.name}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
    );

    const content = response.content
      ? Buffer.from(response.content.replace(/\n/g, ""), response.encoding === "base64" ? "base64" : "utf8").toString("utf8")
      : "";

    return {
      sha: response.sha,
      content,
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "User-Agent": "morediff-dev",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorBody = await safeReadJson(response);
      throw new GitHubRequestError({
        status: response.status,
        message: extractGitHubErrorMessage(errorBody, response.statusText),
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractGitHubErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback || "GitHub request failed";
}
