export interface SaveBranchFileInput {
  baseBranch: string;
  branch: string;
  compareBranches: string[];
  expectedHeadSha: string;
  path: string;
  message: string;
}

export function validateSaveBranchFileInput(input: SaveBranchFileInput): void {
  const baseBranch = input.baseBranch.trim();
  const branch = input.branch.trim();
  const compareBranches = input.compareBranches.map((candidate) =>
    candidate.trim(),
  );

  if (baseBranch.length === 0) {
    throw new Error("기준 브랜치가 필요합니다");
  }

  if (branch.length === 0) {
    throw new Error("브랜치가 필요합니다");
  }

  if (branch === baseBranch) {
    throw new Error("기준 브랜치에는 변경사항을 저장할 수 없습니다");
  }

  if (compareBranches.length === 0) {
    throw new Error("저장하려면 비교 브랜치가 필요합니다");
  }

  if (!compareBranches.includes(branch)) {
    throw new Error("저장 대상 브랜치는 비교 브랜치 중 하나여야 합니다");
  }

  if (input.expectedHeadSha.trim().length === 0) {
    throw new Error("예상 브랜치 HEAD SHA가 필요합니다");
  }

  if (input.path.trim().length === 0) {
    throw new Error("파일 경로가 필요합니다");
  }

  validateRepositoryFilePath(input.path);

  if (input.message.trim().length === 0) {
    throw new Error("커밋 메시지가 필요합니다");
  }
}

function validateRepositoryFilePath(input: string): void {
  const normalized = input.trim().replace(/\\/g, "/");
  const segments = normalized.split("/");

  if (normalized.startsWith("/")) {
    throw new Error("파일 경로는 저장소 루트 기준 상대 경로여야 합니다");
  }

  if (segments.some((segment) => segment === "..")) {
    throw new Error("파일 경로에는 상위 디렉터리 구간이 포함될 수 없습니다");
  }
}
