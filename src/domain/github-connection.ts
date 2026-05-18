export interface GitHubRepositoryRef {
  owner: string;
  name: string;
  url: string;
}

export function parseGitHubRepositoryUrl(input: string): GitHubRepositoryRef {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("저장소 URL이 필요합니다");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("저장소 URL은 올바른 URL이어야 합니다");
  }

  if (parsed.hostname !== "github.com") {
    throw new Error("github.com 저장소만 지원합니다");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("저장소 URL은 https를 사용해야 합니다");
  }

  const parts = parsed.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error("저장소 URL에는 소유자와 저장소 이름이 포함되어야 합니다");
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
    throw new Error("개인 액세스 토큰이 필요합니다");
  }

  if (/\s/.test(token)) {
    throw new Error("개인 액세스 토큰에는 공백이 포함될 수 없습니다");
  }

  if (token.length < 20) {
    throw new Error("개인 액세스 토큰이 너무 짧습니다");
  }

  return token;
}
