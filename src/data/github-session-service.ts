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
  repoUrl: string;
}) {
  const token = assertPatToken(input.token);
  const repositoryRef = parseGitHubRepositoryUrl(input.repoUrl);
  const client = new GitHubClient(token);

  const [viewer, repository, branches] = await Promise.all([
    client.getViewer(),
    client.getRepository(repositoryRef),
    client.listBranches(repositoryRef),
  ]);

  return {
    viewerLogin: viewer.login,
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
  branch: string;
  path: string;
  content: string;
  message: string;
}) {
  const token = assertPatToken(input.token);
  const repositoryRef = parseGitHubRepositoryUrl(input.repoUrl);
  validateSaveBranchFileInput({
    branch: input.branch,
    path: input.path,
    message: input.message,
  });
  const client = new GitHubClient(token);
  const existingFile = await client.getFileContent(
    repositoryRef,
    input.branch,
    input.path,
  );

  await client.saveBranchFile({
    ref: repositoryRef,
    branch: input.branch,
    path: input.path,
    message: input.message,
    content: input.content,
    sha: existingFile.sha,
  });
}
