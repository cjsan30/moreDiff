import type { CompareSessionViewModel } from "@/src/domain/types";

export type WorkspaceDraftMap = Record<string, string>;

export function createWorkspaceDraftKey(branchName: string, path: string): string {
  return JSON.stringify([branchName, path]);
}

export function buildWorkspaceDraftMap(
  session: Pick<CompareSessionViewModel, "branches">,
): WorkspaceDraftMap {
  return Object.fromEntries(
    session.branches.flatMap((branch) =>
      branch.files
        .filter((file) => file.contentLoaded)
        .map((file) => [
          createWorkspaceDraftKey(branch.name, file.path),
          file.content,
        ]),
    ),
  );
}

export function buildWorkspaceBaseContentMap(
  session: Pick<CompareSessionViewModel, "branches">,
): WorkspaceDraftMap {
  return Object.fromEntries(
    session.branches.flatMap((branch) =>
      branch.files
        .filter((file) => file.baseContentLoaded)
        .map((file) => [
          createWorkspaceDraftKey(branch.name, file.path),
          file.baseContent ?? "",
        ]),
    ),
  );
}

export function buildLoadedWorkspaceContentKeys(
  session: Pick<CompareSessionViewModel, "branches">,
): Set<string> {
  return new Set(
    session.branches.flatMap((branch) =>
      branch.files
        .filter((file) => file.contentLoaded)
        .map((file) => createWorkspaceDraftKey(branch.name, file.path)),
    ),
  );
}

export function buildLoadedWorkspaceBaseContentKeys(
  session: Pick<CompareSessionViewModel, "branches">,
): Set<string> {
  return new Set(
    session.branches.flatMap((branch) =>
      branch.files
        .filter((file) => file.baseContentLoaded)
        .map((file) => createWorkspaceDraftKey(branch.name, file.path)),
    ),
  );
}

export function isWorkspaceDraftDirty(
  drafts: WorkspaceDraftMap,
  savedContents: WorkspaceDraftMap,
  key: string,
): boolean {
  return (drafts[key] ?? "") !== (savedContents[key] ?? "");
}

export function countWorkspaceDirtyDrafts(
  drafts: WorkspaceDraftMap,
  savedContents: WorkspaceDraftMap,
): number {
  return Object.keys(drafts).filter((key) =>
    isWorkspaceDraftDirty(drafts, savedContents, key),
  ).length;
}

export function countWorkspaceDirtyDraftsForPath(
  drafts: WorkspaceDraftMap,
  savedContents: WorkspaceDraftMap,
  branchNames: string[],
  path: string,
): number {
  return branchNames.filter((branchName) =>
    isWorkspaceDraftDirty(
      drafts,
      savedContents,
      createWorkspaceDraftKey(branchName, path),
    ),
  ).length;
}
