import type { CompareBranch, FileStatus } from "@/src/domain/types";
import type { GitHubRepositoryRef } from "@/src/domain/github-connection";

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
  full_name?: string;
  private: boolean;
  default_branch: string;
  html_url?: string;
  owner: {
    login: string;
  };
}

interface GitHubCompareResponse {
  files?: Array<{
    filename: string;
    previous_filename?: string;
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

interface GitHubUpdateContentResponse {
  content?: {
    sha?: string;
  };
  commit: {
    sha: string;
  };
}

interface GitHubPullRequestResponse {
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  updated_at: string;
  user?: {
    login?: string;
  } | null;
  base: {
    ref: string;
    repo?: {
      full_name?: string;
    } | null;
  };
  head: {
    ref: string;
    sha: string;
    repo?: {
      full_name?: string;
    } | null;
  };
}

interface GitHubPullRequestCreateResponse extends GitHubPullRequestResponse {}

export interface GitHubConnectionSummary {
  viewerLogin: string;
  repositories: GitHubAccessibleRepository[];
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

export interface GitHubAccessibleRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export interface GitHubPullRequestSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  isSameRepository: boolean;
  updatedAt: string;
  authorLogin: string;
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

  async listRepositories(): Promise<GitHubAccessibleRepository[]> {
    const repositories = await this.request<GitHubRepoResponse[]>(
      "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    );

    return repositories.map((repository) => ({
      owner: repository.owner.login,
      name: repository.name,
      fullName: repository.full_name ?? `${repository.owner.login}/${repository.name}`,
      url: repository.html_url ?? `https://github.com/${repository.owner.login}/${repository.name}`,
      isPrivate: repository.private,
      defaultBranch: repository.default_branch,
    }));
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

  async listPullRequests(ref: GitHubRepositoryRef): Promise<GitHubPullRequestSummary[]> {
    const pullRequests = await this.request<GitHubPullRequestResponse[]>(
      `/repos/${ref.owner}/${ref.name}/pulls?state=open&per_page=100&sort=updated&direction=desc`,
    );

    return pullRequests.map((pullRequest) => mapPullRequestResponse(pullRequest));
  }

  async getPullRequest(
    ref: GitHubRepositoryRef,
    pullNumber: number,
  ): Promise<GitHubPullRequestSummary> {
    const pullRequest = await this.request<GitHubPullRequestResponse>(
      `/repos/${ref.owner}/${ref.name}/pulls/${pullNumber}`,
    );

    return mapPullRequestResponse(pullRequest);
  }

  async createPullRequest(options: {
    ref: GitHubRepositoryRef;
    title: string;
    body?: string;
    baseBranch: string;
    headBranch: string;
    draft?: boolean;
  }): Promise<GitHubPullRequestSummary> {
    const pullRequest = await this.request<GitHubPullRequestCreateResponse>(
      `/repos/${options.ref.owner}/${options.ref.name}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: options.title,
          body: options.body ?? "",
          base: options.baseBranch,
          head: options.headBranch,
          draft: options.draft ?? false,
        }),
      },
    );

    return mapPullRequestResponse(pullRequest);
  }

  async updatePullRequest(options: {
    ref: GitHubRepositoryRef;
    pullNumber: number;
    title?: string;
    body?: string;
    baseBranch?: string;
    state?: "open" | "closed";
  }): Promise<GitHubPullRequestSummary> {
    const pullRequest = await this.request<GitHubPullRequestResponse>(
      `/repos/${options.ref.owner}/${options.ref.name}/pulls/${options.pullNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          title: options.title,
          body: options.body,
          base: options.baseBranch,
          state: options.state,
        }),
      },
    );

    return mapPullRequestResponse(pullRequest);
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

        return {
          path: file.filename,
          basePath: file.previous_filename ?? file.filename,
          status: normalizedStatus,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch ?? "patch를 사용할 수 없습니다",
          content: "",
          contentLoaded: normalizedStatus === "deleted",
          baseContent: "",
          baseContentLoaded: false,
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
  }): Promise<{ headSha: string; contentSha: string }> {
    if (options.branch.trim().length === 0) {
      throw new Error("브랜치가 필요합니다");
    }

    if (options.path.trim().length === 0) {
      throw new Error("파일 경로가 필요합니다");
    }

    if (options.message.trim().length === 0) {
      throw new Error("커밋 메시지가 필요합니다");
    }

    const response = await this.request<GitHubUpdateContentResponse>(
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

    return {
      headSha: response.commit.sha,
      contentSha: response.content?.sha ?? "",
    };
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

  return fallback || "GitHub 요청에 실패했습니다";
}

function mapPullRequestResponse(
  pullRequest: GitHubPullRequestResponse,
): GitHubPullRequestSummary {
  const baseRepoName = pullRequest.base.repo?.full_name ?? "";
  const headRepoName = pullRequest.head.repo?.full_name ?? "";

  return {
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    url: pullRequest.html_url,
    baseBranch: pullRequest.base.ref,
    headBranch: pullRequest.head.ref,
    headSha: pullRequest.head.sha,
    isSameRepository:
      baseRepoName.length > 0 &&
      headRepoName.length > 0 &&
      baseRepoName === headRepoName,
    updatedAt: pullRequest.updated_at,
    authorLogin: pullRequest.user?.login ?? "",
  };
}
