export interface GitHubRepositoryRef {
  owner: string;
  name: string;
  url: string;
}

export function parseGitHubRepositoryUrl(input: string): GitHubRepositoryRef {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("repository URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("repository URL must be a valid URL");
  }

  if (parsed.hostname !== "github.com") {
    throw new Error("only github.com repositories are supported");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("repository URL must use https");
  }

  const parts = parsed.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error("repository URL must include owner and repository name");
  }

  const [owner, name] = parts;
  return {
    owner,
    name,
    url: `https://github.com/${owner}/${name}`,
  };
}

export function assertPatToken(input: string): string {
  const token = input.trim();
  if (token.length === 0) {
    throw new Error("personal access token is required");
  }

  if (/\s/.test(token)) {
    throw new Error("personal access token must not contain whitespace");
  }

  if (token.length < 20) {
    throw new Error("personal access token looks too short");
  }

  return token;
}
