"use client";

import { useEffect, useState } from "react";

import type { CompareSessionViewModel, ReviewNote } from "@/src/domain/types";
import {
  buildLoadedWorkspaceContentKeys,
  buildWorkspaceDraftMap,
  countWorkspaceDirtyDrafts,
  countWorkspaceDirtyDraftsForPath,
  createWorkspaceDraftKey,
  isWorkspaceDraftDirty,
} from "@/src/ui/components/compare-workspace-drafts";
import {
  readRecentCompareSessions,
  upsertRecentCompareSession,
  writeRecentCompareSessions,
} from "@/src/ui/components/recent-compare-sessions";
import { DiffView, type DiffViewMode } from "@/src/ui/components/diff-view";

type FileFilter = "any" | "overlap" | "all" | "branch";
const FILE_PAGE_SIZE = 80;

interface ReviewNotesResult {
  notes: ReviewNote[];
  error?: string;
}

interface ReviewNoteResult {
  note?: ReviewNote;
  error?: string;
}

interface ExportSummaryResult {
  filename?: string;
  markdown?: string;
  stats?: {
    branches: number;
    files: number;
    overlapFiles: number;
    notes: number;
    pullRequests: number;
  };
  error?: string;
}

interface PullRequestMutationResult {
  pullRequest?: {
    number: number;
    title: string;
    url: string;
    baseBranch: string;
    headBranch: string;
  };
  error?: string;
}

interface CompareWorkspaceProps {
  session: CompareSessionViewModel;
  connection?: {
    token: string;
    repoUrl: string;
    sessionId?: string;
  };
}

export function CompareWorkspace({ session, connection }: CompareWorkspaceProps) {
  const [activePath, setActivePath] = useState(session.fileMatrix[0]?.path ?? "");
  const [savedContents, setSavedContents] = useState(() =>
    buildWorkspaceDraftMap(session),
  );
  const [drafts, setDrafts] = useState(() =>
    buildWorkspaceDraftMap(session),
  );
  const [loadedContentKeys, setLoadedContentKeys] = useState(() =>
    buildLoadedWorkspaceContentKeys(session),
  );
  const [loadingContentKeys, setLoadingContentKeys] = useState<Record<string, boolean>>(
    {},
  );
  const [failedContentKeys, setFailedContentKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [branchHeadShas, setBranchHeadShas] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      session.branches.map((branch) => [branch.name, branch.headSha]),
    ),
  );
  const [lastSaved, setLastSaved] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [contentLoadError, setContentLoadError] = useState<string>("");
  const [sessionSaveStatus, setSessionSaveStatus] = useState<string>("");
  const [savingBranchName, setSavingBranchName] = useState<string>("");
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBranchName, setNoteBranchName] = useState(session.branches[0]?.name ?? "");
  const [notesStatus, setNotesStatus] = useState("");
  const [notesError, setNotesError] = useState("");
  const [exportMarkdown, setExportMarkdown] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [publishBranchName, setPublishBranchName] = useState(
    session.branches[0]?.name ?? "",
  );
  const [pullRequestNumber, setPullRequestNumber] = useState("");
  const [pullRequestTitle, setPullRequestTitle] = useState("");
  const [pullRequestBody, setPullRequestBody] = useState("");
  const [pullRequestStatus, setPullRequestStatus] = useState("");
  const [fileFilter, setFileFilter] = useState<FileFilter>("any");
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("unified");
  const [filterBranchName, setFilterBranchName] = useState(
    session.branches[0]?.name ?? "",
  );
  const [visibleFileLimit, setVisibleFileLimit] = useState(FILE_PAGE_SIZE);

  const filteredRows = session.fileMatrix.filter((row) => {
    const changedBranches = row.branches.filter((branch) => branch.changed);
    if (fileFilter === "overlap") {
      return changedBranches.length > 1;
    }

    if (fileFilter === "all") {
      return changedBranches.length === session.branches.length;
    }

    if (fileFilter === "branch") {
      return row.branches.some(
        (branch) => branch.branchName === filterBranchName && branch.changed,
      );
    }

    return changedBranches.length > 0;
  });
  const selectedPath = filteredRows.some((row) => row.path === activePath)
    ? activePath
    : filteredRows[0]?.path ?? "";
  const activeBranches = session.branches
    .map((branch) => ({
      ...branch,
      file: branch.files.find((candidate) => candidate.path === selectedPath),
    }))
    .filter((branch) => branch.file);
  const activeHunkOverlaps = session.hunkOverlaps.filter(
    (overlap) => overlap.path === selectedPath,
  );
  const activeReviewNotes = reviewNotes.filter(
    (note) => note.filePath === selectedPath,
  );
  const dirtyDraftCount = countWorkspaceDirtyDrafts(drafts, savedContents);
  const branchNames = session.branches.map((branch) => branch.name);
  const visibleRows = filteredRows.slice(0, visibleFileLimit);

  useEffect(() => {
    if (!connection || !selectedPath) {
      return;
    }

    for (const branch of activeBranches) {
      if (!branch.file || branch.file.contentLoaded) {
        continue;
      }

      const key = createWorkspaceDraftKey(branch.name, selectedPath);
      if (
        loadedContentKeys.has(key) ||
        loadingContentKeys[key] ||
        failedContentKeys.has(key)
      ) {
        continue;
      }

      void loadBranchContent(branch.name, selectedPath, key);
    }
  });

  useEffect(() => {
    setVisibleFileLimit(FILE_PAGE_SIZE);
  }, [fileFilter, filterBranchName]);

  useEffect(() => {
    if (!connection?.sessionId) {
      return;
    }

    void loadReviewNotes();
  }, [connection?.sessionId]);

  useEffect(() => {
    if (activeBranches.some((branch) => branch.name === noteBranchName)) {
      return;
    }

    setNoteBranchName(activeBranches[0]?.name ?? session.branches[0]?.name ?? "");
  }, [activeBranches, noteBranchName, session.branches]);

  useEffect(() => {
    if (session.branches.some((branch) => branch.name === publishBranchName)) {
      return;
    }

    setPublishBranchName(session.branches[0]?.name ?? "");
  }, [publishBranchName, session.branches]);

  async function loadReviewNotes() {
    if (!connection?.sessionId) {
      return;
    }

    try {
      const headers: HeadersInit = connection.token
        ? {
            "x-morediff-token": connection.token,
          }
        : {};
      const response = await fetch(
        `/api/compare/sessions/${encodeURIComponent(connection.sessionId)}/notes`,
        {
          headers,
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as ReviewNotesResult;
      if (!response.ok) {
        throw new Error(payload.error ?? "failed to load review notes");
      }

      setReviewNotes(payload.notes);
    } catch (error) {
      setNotesError(
        error instanceof Error ? error.message : "failed to load review notes",
      );
    }
  }

  async function handleSaveReviewNote(status: ReviewNote["status"] = "open") {
    if (!connection?.sessionId) {
      setNotesError("Save the live session before adding review notes.");
      return;
    }
    if (!selectedPath || !noteBranchName) {
      return;
    }

    setNotesError("");
    setNotesStatus("");

    try {
      const response = await fetch(
        `/api/compare/sessions/${encodeURIComponent(connection.sessionId)}/notes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: connection.token,
            branchName: noteBranchName,
            filePath: selectedPath,
            body: noteDraft,
            status,
          }),
        },
      );
      const payload = (await response.json()) as ReviewNoteResult;
      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "failed to save review note");
      }

      setReviewNotes((current) => [
        payload.note as ReviewNote,
        ...current.filter((note) => note.id !== payload.note?.id),
      ]);
      setNoteDraft("");
      setNotesStatus(
        status === "resolved" ? "Review note resolved." : "Review note saved.",
      );
    } catch (error) {
      setNotesError(
        error instanceof Error ? error.message : "failed to save review note",
      );
    }
  }

  async function handleExportSummary() {
    if (!connection?.sessionId) {
      setExportStatus("Demo sessions can be inspected but not exported.");
      return;
    }

    setExportStatus("");
    setExportMarkdown("");

    try {
      const headers: HeadersInit = connection.token
        ? {
            "x-morediff-token": connection.token,
          }
        : {};
      const response = await fetch(
        `/api/compare/sessions/${encodeURIComponent(connection.sessionId)}/export`,
        {
          headers,
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as ExportSummaryResult;
      if (!response.ok) {
        throw new Error(payload.error ?? "failed to export session summary");
      }

      setExportMarkdown(payload.markdown ?? "");
      setExportStatus(
        `Export ready: ${payload.filename ?? "morediff-summary.md"}`,
      );
    } catch (error) {
      setExportStatus(
        error instanceof Error ? error.message : "failed to export session summary",
      );
    }
  }

  async function handleCreatePullRequest() {
    if (!connection) {
      setPullRequestStatus("Connect a GitHub repository before publishing PRs.");
      return;
    }

    setPullRequestStatus("");

    try {
      const response = await fetch("/api/github/pulls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: connection.token,
          repoUrl: connection.repoUrl,
          title:
            pullRequestTitle.trim() ||
            `Merge ${publishBranchName} into ${session.baseBranch}`,
          body: pullRequestBody,
          baseBranch: session.baseBranch,
          headBranch: publishBranchName,
        }),
      });
      const payload = (await response.json()) as PullRequestMutationResult;
      if (!response.ok || !payload.pullRequest) {
        throw new Error(payload.error ?? "failed to create pull request");
      }

      setPullRequestNumber(String(payload.pullRequest.number));
      setPullRequestStatus(
        `Created PR #${payload.pullRequest.number}: ${payload.pullRequest.title}`,
      );
    } catch (error) {
      setPullRequestStatus(
        error instanceof Error ? error.message : "failed to create pull request",
      );
    }
  }

  async function handleUpdatePullRequest() {
    if (!connection) {
      setPullRequestStatus("Connect a GitHub repository before updating PRs.");
      return;
    }

    const number = Number.parseInt(pullRequestNumber, 10);
    if (!Number.isInteger(number) || number <= 0) {
      setPullRequestStatus("Enter a pull request number to update.");
      return;
    }

    setPullRequestStatus("");

    try {
      const response = await fetch(
        `/api/github/pulls/${encodeURIComponent(String(number))}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: connection.token,
            repoUrl: connection.repoUrl,
            title: pullRequestTitle.trim() || undefined,
            body: pullRequestBody || undefined,
            baseBranch: session.baseBranch,
          }),
        },
      );
      const payload = (await response.json()) as PullRequestMutationResult;
      if (!response.ok || !payload.pullRequest) {
        throw new Error(payload.error ?? "failed to update pull request");
      }

      setPullRequestStatus(
        `Updated PR #${payload.pullRequest.number}: ${payload.pullRequest.title}`,
      );
    } catch (error) {
      setPullRequestStatus(
        error instanceof Error ? error.message : "failed to update pull request",
      );
    }
  }

  async function loadBranchContent(
    branchName: string,
    path: string,
    key: string,
  ) {
    if (!connection) {
      return;
    }

    setLoadingContentKeys((current) => ({
      ...current,
      [key]: true,
    }));
    setContentLoadError("");

    try {
      const response = await fetch("/api/github/file-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: connection.token,
          repoUrl: connection.repoUrl,
          baseBranch: session.baseBranch,
          branch: branchName,
          compareBranches: session.branches.map((branch) => branch.name),
          expectedHeadSha: branchHeadShas[branchName] ?? "",
          path,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        content?: string;
        headSha?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "failed to load branch file");
      }

      const content = payload.content ?? "";
      setDrafts((current) =>
        Object.prototype.hasOwnProperty.call(current, key)
          ? current
          : {
              ...current,
              [key]: content,
            },
      );
      setSavedContents((current) => ({
        ...current,
        [key]: content,
      }));
      setLoadedContentKeys((current) => new Set([...current, key]));

      if (payload.headSha) {
        setBranchHeadShas((current) => ({
          ...current,
          [branchName]: payload.headSha ?? current[branchName],
        }));
      }
    } catch (error) {
      setFailedContentKeys((current) => new Set([...current, key]));
      setContentLoadError(
        error instanceof Error ? error.message : "failed to load branch file",
      );
    } finally {
      setLoadingContentKeys((current) => ({
        ...current,
        [key]: false,
      }));
    }
  }

  function markDraftSaved(
    branchName: string,
    path: string,
    content: string,
    nextHeadSha?: string,
  ) {
    const key = createWorkspaceDraftKey(branchName, path);
    setDrafts((current) => ({
      ...current,
      [key]: content,
    }));
    setSavedContents((current) => ({
      ...current,
      [key]: content,
    }));
    setLoadedContentKeys((current) => new Set([...current, key]));

    if (nextHeadSha) {
      setBranchHeadShas((current) => ({
        ...current,
        [branchName]: nextHeadSha,
      }));
    }
  }

  async function persistCurrentSession(
    message = "Session metadata saved",
    branchHeadOverrides: Record<string, string> = {},
  ) {
    if (!connection) {
      setSessionSaveStatus("Demo sessions are not persisted.");
      return;
    }

    const branchHeads = {
      ...branchHeadShas,
      ...branchHeadOverrides,
    };
    const currentSessions = readRecentCompareSessions();
    const nextSessions = upsertRecentCompareSession(currentSessions, {
      repoUrl: connection.repoUrl,
      baseBranch: session.baseBranch,
      compareBranches: session.branches.map((branch) => branch.name),
      branchHeads,
    });
    writeRecentCompareSessions(nextSessions);

    try {
      const response = await fetch("/api/compare/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: connection.token,
          repoUrl: connection.repoUrl,
          baseBranch: session.baseBranch,
          compareBranches: session.branches.map((branch) => branch.name),
          branchHeads,
        }),
      });
      if (!response.ok) {
        throw new Error("server persistence failed");
      }

      setSessionSaveStatus(message);
    } catch {
      setSessionSaveStatus(`${message} locally; server persistence failed.`);
    }
  }

  async function handleSaveBranch(
    branchName: string,
    expectedHeadSha: string,
    path: string,
    content: string,
  ) {
    if (!connection) {
      markDraftSaved(branchName, path, content);
      setLastSaved(`Demo mode only: edited ${path} in ${branchName}`);
      setSaveError("");
      return;
    }

    setSavingBranchName(branchName);
    setSaveError("");
    setLastSaved("");

    try {
      const response = await fetch("/api/github/save-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: connection.token,
          repoUrl: connection.repoUrl,
          baseBranch: session.baseBranch,
          branch: branchName,
          compareBranches: session.branches.map((branch) => branch.name),
          expectedHeadSha,
          sessionId: connection.sessionId,
          path,
          content,
          message: `Update ${path} from MoreDiff`,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        headSha?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "failed to save branch file");
      }

      markDraftSaved(branchName, path, content, payload.headSha);
      void persistCurrentSession(
        `Saved ${path} and refreshed session metadata`,
        payload.headSha ? { [branchName]: payload.headSha } : {},
      );
      setLastSaved(`Saved ${path} to ${branchName}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "save failed");
    } finally {
      setSavingBranchName("");
    }
  }

  return (
    <main className="workspaceShell">
      <header className="workspaceHeader">
        <div>
          <p className="workspaceEyebrow">GitHub Multi-Branch Compare MVP</p>
          <h1>
            {session.repository.owner}/{session.repository.name}
          </h1>
          <p className="workspaceSubhead">
            Base branch <strong>{session.baseBranch}</strong> compared against{" "}
            <strong>{session.branches.length}</strong> branches.
            {dirtyDraftCount > 0 ? (
              <>
                {" "}
                <span className="dirtyInline">
                  {dirtyDraftCount} unsaved draft{dirtyDraftCount > 1 ? "s" : ""}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="workspaceHeaderActions">
          <button
            type="button"
            onClick={() => void persistCurrentSession()}
            disabled={!connection}
          >
            Save session
          </button>
          <button
            type="button"
            onClick={() => void handleExportSummary()}
            disabled={!connection?.sessionId}
          >
            Export summary
          </button>
          <span>
            {connection
              ? "Repo and branch metadata are stored without the PAT."
              : "Demo session"}
          </span>
        </div>
        <div className="workspaceStats">
          <div>
            <span>Files in matrix</span>
            <strong>{session.fileMatrix.length}</strong>
          </div>
          <div>
            <span>Overlap files</span>
            <strong>{session.overlapFiles.length}</strong>
          </div>
          <div>
            <span>Hunk overlaps</span>
            <strong>{session.hunkOverlaps.length}</strong>
          </div>
          <div>
            <span>Unsaved drafts</span>
            <strong>{dirtyDraftCount}</strong>
          </div>
        </div>
      </header>

      <section className="workspaceLayout">
        <aside className="fileListPanel">
          <div className="panelHeading">
            <h2>Changed Files</h2>
            <p>Pick a file to compare branch changes side by side.</p>
          </div>
          <div className="filterControls">
            <label>
              <span>Filter</span>
              <select
                value={fileFilter}
                onChange={(event) => setFileFilter(event.target.value as FileFilter)}
              >
                <option value="any">Changed in any branch</option>
                <option value="overlap">Changed in multiple branches</option>
                <option value="all">Changed in all branches</option>
                <option value="branch">Changed in selected branch</option>
              </select>
            </label>
            {fileFilter === "branch" ? (
              <label>
                <span>Branch</span>
                <select
                  value={filterBranchName}
                  onChange={(event) => setFilterBranchName(event.target.value)}
                >
                  {session.branches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <p className="listSummary">
            Showing {Math.min(visibleRows.length, filteredRows.length)} of{" "}
            {filteredRows.length} matching files.
          </p>
          <ul className="fileList">
            {visibleRows.map((row) => {
              const changedCount = row.branches.filter((branch) => branch.changed).length;
              const isOverlap = changedCount > 1;
              const dirtyCount = countWorkspaceDirtyDraftsForPath(
                drafts,
                savedContents,
                branchNames,
                row.path,
              );
              return (
                <li key={row.path}>
                  <button
                    className={row.path === selectedPath ? "fileButton active" : "fileButton"}
                    onClick={() => setActivePath(row.path)}
                    type="button"
                  >
                    <span>{row.path}</span>
                    <small>{changedCount} branch{changedCount > 1 ? "es" : ""}</small>
                    {isOverlap ? <em>overlap</em> : null}
                    {dirtyCount > 0 ? (
                      <em className="dirtyMarker">
                        {dirtyCount} unsaved
                      </em>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {filteredRows.length === 0 ? (
            <p className="emptyState">No files match this filter.</p>
          ) : null}
          {visibleRows.length < filteredRows.length ? (
            <button
              type="button"
              className="loadMoreButton"
              onClick={() =>
                setVisibleFileLimit((current) => current + FILE_PAGE_SIZE)
              }
            >
              Show {Math.min(FILE_PAGE_SIZE, filteredRows.length - visibleRows.length)} more
            </button>
          ) : null}
        </aside>

        <section className="detailPanel">
          <div className="panelHeading">
            <h2>{selectedPath || "No file selected"}</h2>
            <p>
              Branch-local edits stay scoped to the branch pane where you make the
              change.
            </p>
          </div>
          <div className="diffModeControls">
            <span>Diff view</span>
            <div>
              <button
                type="button"
                className={diffViewMode === "unified" ? "active" : ""}
                onClick={() => setDiffViewMode("unified")}
              >
                Unified
              </button>
              <button
                type="button"
                className={diffViewMode === "split" ? "active" : ""}
                onClick={() => setDiffViewMode("split")}
              >
                Split
              </button>
            </div>
          </div>

          <div className="matrixPanel">
            <div className="matrixHeader">
              <span>Branch</span>
              <span>Status</span>
              <span>Delta</span>
            </div>
            {session.fileMatrix
              .find((row) => row.path === selectedPath)
              ?.branches.map((branch) => (
                <div className="matrixRow" key={`${selectedPath}:${branch.branchName}`}>
                  <span>{branch.branchName}</span>
                  <span>{branch.changed ? branch.status : "unchanged"}</span>
                  <span>
                    {branch.changed
                      ? `+${branch.additions ?? 0} / -${branch.deletions ?? 0}`
                      : "base only"}
                  </span>
                </div>
              ))}
          </div>

          {activeHunkOverlaps.length > 0 ? (
            <div className="overlapPanel">
              <h3>Overlapping hunk regions</h3>
              <ul>
                {activeHunkOverlaps.map((overlap) => (
                  <li
                    key={`${overlap.path}:${overlap.startLine}:${overlap.endLine}:${overlap.branches.join(",")}`}
                  >
                    Lines {overlap.startLine}-{overlap.endLine}:{" "}
                    <strong>{overlap.branches.join(" + ")}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <section className="reviewNotesPanel">
            <div className="reviewNotesHeading">
              <div>
                <h3>Review notes</h3>
                <p>
                  Capture manual reconciliation notes for this file before
                  exporting the session summary.
                </p>
              </div>
              <label>
                <span>Branch</span>
                <select
                  value={noteBranchName}
                  onChange={(event) => setNoteBranchName(event.target.value)}
                >
                  {activeBranches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              aria-label={`Review note for ${selectedPath}`}
              placeholder="Write overlap, risk, or follow-up notes for this file."
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
            />
            <div className="reviewNoteActions">
              <button
                type="button"
                onClick={() => void handleSaveReviewNote("open")}
                disabled={!connection?.sessionId || noteDraft.trim().length === 0}
              >
                Save note
              </button>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => void handleSaveReviewNote("resolved")}
                disabled={!connection?.sessionId || noteDraft.trim().length === 0}
              >
                Save resolved
              </button>
            </div>
            {activeReviewNotes.length > 0 ? (
              <ul className="reviewNoteList">
                {activeReviewNotes.map((note) => (
                  <li key={note.id}>
                    <strong>{note.branchName}</strong>
                    <span>{note.status}</span>
                    <p>{note.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emptyState">No notes for this file yet.</p>
            )}
          </section>

          <section className="publishPanel">
            <div className="reviewNotesHeading">
              <div>
                <h3>Publish pull request</h3>
                <p>
                  Create or update a GitHub PR from a compare branch after review
                  edits are saved.
                </p>
              </div>
              <label>
                <span>Head branch</span>
                <select
                  value={publishBranchName}
                  onChange={(event) => setPublishBranchName(event.target.value)}
                >
                  {session.branches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="publishFields">
              <label>
                <span>PR number for update</span>
                <input
                  inputMode="numeric"
                  placeholder="Leave blank to create a new PR"
                  value={pullRequestNumber}
                  onChange={(event) => setPullRequestNumber(event.target.value)}
                />
              </label>
              <label>
                <span>Title</span>
                <input
                  placeholder={`Merge ${publishBranchName} into ${session.baseBranch}`}
                  value={pullRequestTitle}
                  onChange={(event) => setPullRequestTitle(event.target.value)}
                />
              </label>
              <label>
                <span>Body</span>
                <textarea
                  placeholder="Summarize the branch changes or paste the exported MoreDiff summary."
                  value={pullRequestBody}
                  onChange={(event) => setPullRequestBody(event.target.value)}
                />
              </label>
            </div>
            <div className="reviewNoteActions">
              <button
                type="button"
                onClick={() => void handleCreatePullRequest()}
                disabled={!connection}
              >
                Create PR
              </button>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => void handleUpdatePullRequest()}
                disabled={!connection || pullRequestNumber.trim().length === 0}
              >
                Update PR
              </button>
            </div>
            {pullRequestStatus ? (
              <p className="publishStatus">{pullRequestStatus}</p>
            ) : null}
          </section>

          <div className="editorGrid">
            {activeBranches.map((branch) => {
              const key = createWorkspaceDraftKey(branch.name, selectedPath);
              const isContentLoaded =
                loadedContentKeys.has(key) || branch.file?.contentLoaded === true;
              const isContentLoading = Boolean(loadingContentKeys[key]);
              const content = isContentLoaded
                ? drafts[key] ?? branch.file?.content ?? ""
                : "";
              const isDirty =
                isContentLoaded &&
                isWorkspaceDraftDirty(drafts, savedContents, key);
              const expectedHeadSha = branchHeadShas[branch.name] ?? branch.headSha;
              return (
                <article className="editorCard" key={key}>
                  <header>
                    <div>
                      <h3>{branch.name}</h3>
                      <p>
                        {branch.file?.status} · +{branch.file?.additions} / -
                        {branch.file?.deletions}
                      </p>
                      <span className={isDirty ? "dirtyBadge" : "cleanBadge"}>
                        {isContentLoading
                          ? "Loading file content"
                          : isDirty
                            ? "Unsaved changes"
                            : "No unsaved changes"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveBranch(
                          branch.name,
                          expectedHeadSha,
                          selectedPath,
                          content,
                        )
                      }
                      disabled={savingBranchName === branch.name || !isDirty}
                    >
                      {savingBranchName === branch.name ? "Saving..." : "Save branch"}
                    </button>
                  </header>
                  <DiffView
                    patch={branch.file?.patch ?? "patch unavailable"}
                    mode={diffViewMode}
                  />
                  <textarea
                    aria-label={`Editor for ${branch.name} ${selectedPath}`}
                    placeholder={
                      isContentLoading
                        ? "Loading branch file content..."
                        : "File content is loaded when this pane becomes active."
                    }
                    value={content}
                    disabled={!isContentLoaded || isContentLoading}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </article>
              );
            })}
          </div>

          {lastSaved ? <p className="saveNotice">{lastSaved}</p> : null}
          {sessionSaveStatus ? (
            <p className="saveNotice">{sessionSaveStatus}</p>
          ) : null}
          {notesStatus ? <p className="saveNotice">{notesStatus}</p> : null}
          {exportStatus ? <p className="saveNotice">{exportStatus}</p> : null}
          {exportMarkdown ? (
            <pre className="exportPreview">{exportMarkdown}</pre>
          ) : null}
          {saveError ? <p className="errorNotice">{saveError}</p> : null}
          {notesError ? <p className="errorNotice">{notesError}</p> : null}
          {contentLoadError ? (
            <p className="errorNotice">{contentLoadError}</p>
          ) : null}
        </section>
      </section>
    </main>
  );
}
