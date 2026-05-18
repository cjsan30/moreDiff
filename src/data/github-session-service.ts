import {
  createCompareSession,
  validateCompareSessionRequest,
} from "@/src/domain/compare-session";
import {
  assertPatToken,
  type GitHubRepositoryRef,
  parseGitHubRepositoryUrl,
} from "@/src/domain/github-connection";
import type { FileStatus } from "@/src/domain/types";
import { validateSaveBranchFileInput } from "@/src/domain/save-branch-file";
import { GitHubClient, GitHubRequestError } from "@/src/github/client";

export async function listPullRequestsFromGitHub(input: {
  token: string;
  repoUrl: string;
}) {
  const token = assertPatToken(input.token);
  const repositoryRef = parseGitHubRepositoryUrl(input.repoUrl);
  const client = new GitHubClient(token);

  return client.listPullRequests(repositoryRef);
}

export async function createPullRequestOnGitHub(input: {
  token: string;
  repoUrl: string;
  title: string;
  body?: string;
  baseBranch: string;
  headBranch: string;
  draft?: boolean;
}) {
  const token = assertPatToken(input.token);
  const repositoryRef = parseGitHubRepositoryUrl(input.repoUrl);
  const title = input.title.trim();
  const baseBranch = input.baseBranch.trim();
  const headBranch = input.headBranch.trim();
  if (!title) {
    throw new Error("풀 리퀘스트 제목이 필요합니다");
  }
  if (!baseBranch) {
    throw new Error("기준 브랜치가 필요합니다");
  }
  if (!headBranch) {
    throw new Error("헤드 브랜치가 필요합니다");
  }
  if (baseBranch === headBranch) {
    throw new Error("풀 리퀘스트 헤드 브랜치는 기준 브랜치와 달라야 합니다");
  }

  const client = new GitHubClient(token);
  return client.createPullRequest({
    ref: repositoryRef,
    title,
    body: input.body,
    baseBranch,
    headBranch,
    draft: input.draft,
  });
}

export async function updatePullRequestOnGitHub(input: {
  token: string;
  repoUrl: string;
  pullNumber: number;
  title?: string;
  body?: string;
  baseBranch?: string;
  state?: "open" | "closed";
}) {
  const token = assertPatToken(input.token);
  const repositoryRef = parseGitHubRepositoryUrl(input.repoUrl);
  if (!Number.isInteger(input.pullNumber) || input.pullNumber <= 0) {
    throw new Error("풀 리퀘스트 번호가 필요합니다");
  }

  const client = new GitHubClient(token);
  return client.updatePullRequest({
    ref: repositoryRef,
    pullNumber: input.pullNumber,
    title: input.title,
    body: input.body,
    baseBranch: input.baseBranch,
    state: input.state,
  });
}

export async function validatePatConnection(input: {
  token: string;
  repoUrl?: string;
}) {
  const token = assertPatToken(input.token);
  const client = new GitHubClient(token);
  const repoUrl = input.repoUrl?.trim() ?? "";
  const repositoryRef = repoUrl ? parseGitHubRepositoryUrl(repoUrl) : null;

  if (!repositoryRef) {
    const [viewer, repositories] = await Promise.all([
      client.getViewer(),
      client.listRepositories(),
    ]);

    return {
      viewerLogin: viewer.login,
      repositories,
      repository: null,
      branches: [],
    };
  }

  const [viewer, repositories, repository, branches] = await Promise.all([
    client.getViewer(),
    client.listRepositories(),
    client.getRepository(repositoryRef),
    client.listBranches(repositoryRef),
  ]);

  return {
    viewerLogin: viewer.login,
    repositories,
    repository,
    branches,
  };
}

export async function buildCompareSessionFromGitHub(input: {
  token: string;
  repoUrl: string;
  baseBranch: string;
  compareBranches: string[];
}) {
  const token = assertPatToken(input.token);
  const repositoryRef = parseGitHubRepositoryUrl(input.repoUrl);
  validateCompareSessionRequest({
    baseBranch: input.baseBranch,
    compareBranches: input.compareBranches,
  });
  const client = new GitHubClient(token);

  const branches = await Promise.all(
    input.compareBranches.map((branch) =>
      client.buildCompareBranch(repositoryRef, input.baseBranch, branch),
    ),
  );

  return createCompareSession({
    repository: {
      owner: repositoryRef.owner,
      name: repositoryRef.name,
    },
    baseBranch: input.baseBranch,
    branches,
  });
}

export async function saveBranchFileToGitHub(input: {
  token: string;
  repoUrl: string;
  baseBranch: string;
  branch: string;
  compareBranches: string[];
  expectedHeadSha: string;
  path: string;
  content: string;
  message: string;
}) {
  const token = assertPatToken(input.token);
  const repositoryRef = parseGitHubRepositoryUrl(input.repoUrl);
  validateSaveBranchFileInput({
    baseBranch: input.baseBranch,
    branch: input.branch,
    compareBranches: input.compareBranches,
    expectedHeadSha: input.expectedHeadSha,
    path: input.path,
    message: input.message,
  });
  const client = new GitHubClient(token);
  const currentHead = await client.getBranchHead(repositoryRef, input.branch);
  if (currentHead.headSha !== input.expectedHeadSha) {
    throw new Error("브랜치 HEAD가 변경되었습니다. 저장하기 전에 비교 세션을 다시 불러오세요");
  }

  const existingFile = await client.getFileContent(
    repositoryRef,
    input.branch,
    input.path,
  );

  const savedFile = await client.saveBranchFile({
    ref: repositoryRef,
    branch: input.branch,
    path: input.path,
    message: input.message,
    content: input.content,
    sha: existingFile.sha,
  });

  return savedFile;
}

export async function loadBranchFileContentFromGitHub(input: {
  token: string;
  repoUrl: string;
  baseBranch: string;
  branch: string;
  compareBranches: string[];
  expectedHeadSha: string;
  path: string;
  basePath?: string;
  status?: FileStatus;
}) {
  const token = assertPatToken(input.token);
  const repositoryRef = parseGitHubRepositoryUrl(input.repoUrl);
  validateSaveBranchFileInput({
    baseBranch: input.baseBranch,
    branch: input.branch,
    compareBranches: input.compareBranches,
    expectedHeadSha: input.expectedHeadSha,
    path: input.path,
    message: "파일 내용 불러오기",
  });
  const client = new GitHubClient(token);
  const currentHead = await client.getBranchHead(repositoryRef, input.branch);
  if (currentHead.headSha !== input.expectedHeadSha) {
    throw new Error("브랜치 HEAD가 변경되었습니다. 편집하기 전에 비교 세션을 다시 불러오세요");
  }

  const basePath = input.basePath?.trim() || input.path;
  const [file, baseFile] = await Promise.all([
    input.status === "deleted"
      ? Promise.resolve({ sha: "", content: "" })
      : loadRepositoryFileContent(client, repositoryRef, input.branch, input.path, false),
    input.status === "added"
      ? Promise.resolve({ sha: "", content: "" })
      : loadRepositoryFileContent(client, repositoryRef, input.baseBranch, basePath, false),
  ]);
  return {
    content: file.content,
    contentSha: file.sha,
    baseContent: baseFile.content,
    baseContentSha: baseFile.sha,
    headSha: currentHead.headSha,
  };
}

async function loadRepositoryFileContent(
  client: GitHubClient,
  repositoryRef: GitHubRepositoryRef,
  branch: string,
  path: string,
  allowMissing: boolean,
) {
  try {
    return await client.getFileContent(repositoryRef, branch, path);
  } catch (error) {
    if (allowMissing && error instanceof GitHubRequestError && error.status === 404) {
      return { sha: "", content: "" };
    }

    throw error;
  }
}
