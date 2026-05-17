import {
  createCompareSession,
  validateCompareSessionRequest,
} from "@/src/domain/compare-session";
import {
  assertPatToken,
  parseGitHubRepositoryUrl,
} from "@/src/domain/github-connection";
import { validateSaveBranchFileInput } from "@/src/domain/save-branch-file";
import { GitHubClient } from "@/src/github/client";

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
    branches: branches.slice(0, 20),
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
    throw new Error("branch head changed; reload compare session before saving");
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
}) {
  const token = assertPatToken(input.token);
  const repositoryRef = parseGitHubRepositoryUrl(input.repoUrl);
  validateSaveBranchFileInput({
    baseBranch: input.baseBranch,
    branch: input.branch,
    compareBranches: input.compareBranches,
    expectedHeadSha: input.expectedHeadSha,
    path: input.path,
    message: "load file content",
  });
  const client = new GitHubClient(token);
  const currentHead = await client.getBranchHead(repositoryRef, input.branch);
  if (currentHead.headSha !== input.expectedHeadSha) {
    throw new Error("branch head changed; reload compare session before editing");
  }

  const file = await client.getFileContent(repositoryRef, input.branch, input.path);
  return {
    content: file.content,
    contentSha: file.sha,
    headSha: currentHead.headSha,
  };
}
