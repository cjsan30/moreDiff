"use client";

import { useEffect, useState } from "react";

import type {
  CompareSessionViewModel,
  FileStatus,
  ReviewNote,
} from "@/src/domain/types";
import {
  buildLoadedWorkspaceBaseContentKeys,
  buildLoadedWorkspaceContentKeys,
  buildWorkspaceBaseContentMap,
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

interface AiSummaryResult {
  source?: "openai" | "deterministic";
  model?: string;
  summary?: string;
  fallbackReason?: string;
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
  const [baseContents, setBaseContents] = useState(() =>
    buildWorkspaceBaseContentMap(session),
  );
  const [loadedContentKeys, setLoadedContentKeys] = useState(() =>
    buildLoadedWorkspaceContentKeys(session),
  );
  const [loadedBaseContentKeys, setLoadedBaseContentKeys] = useState(() =>
    buildLoadedWorkspaceBaseContentKeys(session),
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
  const [aiSummary, setAiSummary] = useState("");
  const [aiSummaryStatus, setAiSummaryStatus] = useState("");
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
      if (!branch.file) {
        continue;
      }

      const key = createWorkspaceDraftKey(branch.name, selectedPath);
      const needsBranchContent =
        branch.file.contentLoaded !== true && !loadedContentKeys.has(key);
      const needsBaseContent =
        branch.file.baseContentLoaded !== true &&
        !loadedBaseContentKeys.has(key);
      if (!needsBranchContent && !needsBaseContent) {
        continue;
      }

      if (
        loadingContentKeys[key] ||
        failedContentKeys.has(key)
      ) {
        continue;
      }

      void loadBranchContent(
        branch.name,
        selectedPath,
        branch.file.basePath ?? selectedPath,
        branch.file.status,
        key,
      );
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
        throw new Error(payload.error ?? "리뷰 노트를 불러오지 못했습니다");
      }

      setReviewNotes(payload.notes);
    } catch (error) {
      setNotesError(
        error instanceof Error ? error.message : "리뷰 노트를 불러오지 못했습니다",
      );
    }
  }

  async function handleSaveReviewNote(status: ReviewNote["status"] = "open") {
    if (!connection?.sessionId) {
      setNotesError("리뷰 노트를 추가하기 전에 실시간 세션을 저장하세요.");
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
        throw new Error(payload.error ?? "리뷰 노트를 저장하지 못했습니다");
      }

      setReviewNotes((current) => [
        payload.note as ReviewNote,
        ...current.filter((note) => note.id !== payload.note?.id),
      ]);
      setNoteDraft("");
      setNotesStatus(
        status === "resolved" ? "리뷰 노트를 해결됨으로 저장했습니다." : "리뷰 노트를 저장했습니다.",
      );
    } catch (error) {
      setNotesError(
        error instanceof Error ? error.message : "리뷰 노트를 저장하지 못했습니다",
      );
    }
  }

  async function handleExportSummary() {
    if (!connection?.sessionId) {
      setExportStatus("데모 세션은 확인할 수 있지만 내보낼 수는 없습니다.");
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
        throw new Error(payload.error ?? "세션 요약을 내보내지 못했습니다");
      }

      setExportMarkdown(payload.markdown ?? "");
      setExportStatus(
        `내보내기 준비 완료: ${payload.filename ?? "morediff-summary.md"}`,
      );
    } catch (error) {
      setExportStatus(
        error instanceof Error ? error.message : "세션 요약을 내보내지 못했습니다",
      );
    }
  }

  async function handleGenerateAiSummary() {
    if (!connection?.sessionId) {
      setAiSummaryStatus("데모 세션은 확인할 수 있지만 AI 요약은 생성할 수 없습니다.");
      return;
    }

    setAiSummary("");
    setAiSummaryStatus("");

    try {
      const headers: HeadersInit = connection.token
        ? {
            "x-morediff-token": connection.token,
          }
        : {};
      const response = await fetch(
        `/api/compare/sessions/${encodeURIComponent(connection.sessionId)}/ai-summary`,
        {
          headers,
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as AiSummaryResult;
      if (!response.ok) {
        throw new Error(payload.error ?? "AI 요약을 생성하지 못했습니다");
      }

      setAiSummary(payload.summary ?? "");
      setAiSummaryStatus(
        payload.source === "openai"
          ? `${payload.model} 모델로 AI 요약을 생성했습니다.`
          : `대체 요약을 생성했습니다. ${payload.fallbackReason ?? ""}`.trim(),
      );
    } catch (error) {
      setAiSummaryStatus(
        error instanceof Error ? error.message : "AI 요약을 생성하지 못했습니다",
      );
    }
  }

  async function handleCreatePullRequest() {
    if (!connection) {
      setPullRequestStatus("PR을 게시하기 전에 GitHub 저장소를 연결하세요.");
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
            `${publishBranchName}을 ${session.baseBranch}에 병합`,
          body: pullRequestBody,
          baseBranch: session.baseBranch,
          headBranch: publishBranchName,
        }),
      });
      const payload = (await response.json()) as PullRequestMutationResult;
      if (!response.ok || !payload.pullRequest) {
        throw new Error(payload.error ?? "풀 리퀘스트를 생성하지 못했습니다");
      }

      setPullRequestNumber(String(payload.pullRequest.number));
      setPullRequestStatus(
        `PR #${payload.pullRequest.number} 생성됨: ${payload.pullRequest.title}`,
      );
    } catch (error) {
      setPullRequestStatus(
        error instanceof Error ? error.message : "풀 리퀘스트를 생성하지 못했습니다",
      );
    }
  }

  async function handleUpdatePullRequest() {
    if (!connection) {
      setPullRequestStatus("PR을 업데이트하기 전에 GitHub 저장소를 연결하세요.");
      return;
    }

    const number = Number.parseInt(pullRequestNumber, 10);
    if (!Number.isInteger(number) || number <= 0) {
      setPullRequestStatus("업데이트할 풀 리퀘스트 번호를 입력하세요.");
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
        throw new Error(payload.error ?? "풀 리퀘스트를 업데이트하지 못했습니다");
      }

      setPullRequestStatus(
        `PR #${payload.pullRequest.number} 업데이트됨: ${payload.pullRequest.title}`,
      );
    } catch (error) {
      setPullRequestStatus(
        error instanceof Error ? error.message : "풀 리퀘스트를 업데이트하지 못했습니다",
      );
    }
  }

  async function loadBranchContent(
    branchName: string,
    path: string,
    basePath: string,
    status: FileStatus,
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
          basePath,
          status,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        content?: string;
        baseContent?: string;
        headSha?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "브랜치 파일을 불러오지 못했습니다");
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
      setBaseContents((current) => ({
        ...current,
        [key]: payload.baseContent ?? "",
      }));
      setLoadedBaseContentKeys((current) => new Set([...current, key]));

      if (payload.headSha) {
        setBranchHeadShas((current) => ({
          ...current,
          [branchName]: payload.headSha ?? current[branchName],
        }));
      }
    } catch (error) {
      setFailedContentKeys((current) => new Set([...current, key]));
      setContentLoadError(
        error instanceof Error ? error.message : "브랜치 파일을 불러오지 못했습니다",
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
    message = "세션 메타데이터를 저장했습니다",
    branchHeadOverrides: Record<string, string> = {},
  ) {
    if (!connection) {
      setSessionSaveStatus("데모 세션은 저장되지 않습니다.");
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
        throw new Error("서버 저장에 실패했습니다");
      }

      setSessionSaveStatus(message);
    } catch {
      setSessionSaveStatus(`${message} 로컬에만 반영되었습니다. 서버 저장에 실패했습니다.`);
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
      setLastSaved(`데모 모드: ${branchName}의 ${path} 파일을 편집했습니다`);
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
          message: `MoreDiff에서 ${path} 업데이트`,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        headSha?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "브랜치 파일을 저장하지 못했습니다");
      }

      markDraftSaved(branchName, path, content, payload.headSha);
      void persistCurrentSession(
        `${path} 저장 및 세션 메타데이터 새로고침 완료`,
        payload.headSha ? { [branchName]: payload.headSha } : {},
      );
      setLastSaved(`${path} 파일을 ${branchName}에 저장했습니다`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "저장에 실패했습니다");
    } finally {
      setSavingBranchName("");
    }
  }

  return (
    <main className="workspaceShell">
      <header className="workspaceHeader">
        <div>
          <p className="workspaceEyebrow">GitHub 다중 브랜치 비교 MVP</p>
          <h1>
            {session.repository.owner}/{session.repository.name}
          </h1>
          <p className="workspaceSubhead">
            기준 브랜치 <strong>{session.baseBranch}</strong>와{" "}
            <strong>{session.branches.length}</strong>개 브랜치를 비교합니다.
            {dirtyDraftCount > 0 ? (
              <>
                {" "}
                <span className="dirtyInline">
                  저장되지 않은 초안 {dirtyDraftCount}개
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
            세션 저장
          </button>
          <button
            type="button"
            onClick={() => void handleExportSummary()}
            disabled={!connection?.sessionId}
          >
            요약 내보내기
          </button>
          <button
            type="button"
            onClick={() => void handleGenerateAiSummary()}
            disabled={!connection?.sessionId}
          >
            AI 요약
          </button>
          <span>
            {connection
              ? "저장소와 브랜치 메타데이터만 저장되며 PAT는 저장되지 않습니다."
              : "데모 세션"}
          </span>
        </div>
        <div className="workspaceStats">
          <div>
            <span>매트릭스 파일</span>
            <strong>{session.fileMatrix.length}</strong>
          </div>
          <div>
            <span>겹침 파일</span>
            <strong>{session.overlapFiles.length}</strong>
          </div>
          <div>
            <span>겹침 hunk</span>
            <strong>{session.hunkOverlaps.length}</strong>
          </div>
          <div>
            <span>미저장 초안</span>
            <strong>{dirtyDraftCount}</strong>
          </div>
        </div>
      </header>

      <section className="workspaceLayout">
        <aside className="fileListPanel">
          <div className="panelHeading">
            <h2>변경 파일</h2>
            <p>파일을 선택하면 브랜치별 변경 내용을 나란히 비교할 수 있습니다.</p>
          </div>
          <div className="filterControls">
            <label>
              <span>필터</span>
              <select
                value={fileFilter}
                onChange={(event) => setFileFilter(event.target.value as FileFilter)}
              >
                <option value="any">어느 브랜치든 변경됨</option>
                <option value="overlap">여러 브랜치에서 변경됨</option>
                <option value="all">모든 브랜치에서 변경됨</option>
                <option value="branch">선택한 브랜치에서 변경됨</option>
              </select>
            </label>
            {fileFilter === "branch" ? (
              <label>
                <span>브랜치</span>
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
            일치하는 파일 {filteredRows.length}개 중{" "}
            {Math.min(visibleRows.length, filteredRows.length)}개 표시 중입니다.
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
                    <small>브랜치 {changedCount}개</small>
                    {isOverlap ? <em>겹침</em> : null}
                    {dirtyCount > 0 ? (
                      <em className="dirtyMarker">
                        미저장 {dirtyCount}개
                      </em>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {filteredRows.length === 0 ? (
            <p className="emptyState">이 필터와 일치하는 파일이 없습니다.</p>
          ) : null}
          {visibleRows.length < filteredRows.length ? (
            <button
              type="button"
              className="loadMoreButton"
              onClick={() =>
                setVisibleFileLimit((current) => current + FILE_PAGE_SIZE)
              }
            >
              {Math.min(FILE_PAGE_SIZE, filteredRows.length - visibleRows.length)}개 더 보기
            </button>
          ) : null}
        </aside>

        <section className="detailPanel">
          <div className="panelHeading">
            <h2>{selectedPath || "선택한 파일 없음"}</h2>
            <p>
              브랜치별 편집은 해당 브랜치 패널 안에서만 적용됩니다.
            </p>
          </div>
          <div className="diffModeControls">
            <span>차이점 보기</span>
            <div>
              <button
                type="button"
                className={diffViewMode === "unified" ? "active" : ""}
                onClick={() => setDiffViewMode("unified")}
              >
                통합
              </button>
              <button
                type="button"
                className={diffViewMode === "split" ? "active" : ""}
                onClick={() => setDiffViewMode("split")}
              >
                분할
              </button>
            </div>
          </div>

          <div className="matrixPanel">
            <div className="matrixHeader">
              <span>브랜치</span>
              <span>상태</span>
              <span>변경량</span>
            </div>
            {session.fileMatrix
              .find((row) => row.path === selectedPath)
              ?.branches.map((branch) => (
                <div className="matrixRow" key={`${selectedPath}:${branch.branchName}`}>
                  <span>{branch.branchName}</span>
                  <span>{branch.changed ? formatFileStatus(branch.status) : "변경 없음"}</span>
                  <span>
                    {branch.changed
                      ? `+${branch.additions ?? 0} / -${branch.deletions ?? 0}`
                      : "기준만 있음"}
                  </span>
                </div>
              ))}
          </div>

          {activeHunkOverlaps.length > 0 ? (
            <div className="overlapPanel">
              <h3>겹치는 hunk 영역</h3>
              <ul>
                {activeHunkOverlaps.map((overlap) => (
                  <li
                    key={`${overlap.path}:${overlap.startLine}:${overlap.endLine}:${overlap.branches.join(",")}`}
                  >
                    {overlap.startLine}-{overlap.endLine}번 줄:{" "}
                    <strong>{overlap.branches.join(" + ")}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <section className="reviewNotesPanel">
            <div className="reviewNotesHeading">
              <div>
                <h3>리뷰 노트</h3>
                <p>
                  세션 요약을 내보내기 전에 이 파일의 수동 조정 메모를 남깁니다.
                </p>
              </div>
              <label>
                <span>브랜치</span>
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
              aria-label={`${selectedPath} 리뷰 노트`}
              placeholder="이 파일의 겹침, 위험 요소, 후속 작업 메모를 작성하세요."
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
            />
            <div className="reviewNoteActions">
              <button
                type="button"
                onClick={() => void handleSaveReviewNote("open")}
                disabled={!connection?.sessionId || noteDraft.trim().length === 0}
              >
                노트 저장
              </button>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => void handleSaveReviewNote("resolved")}
                disabled={!connection?.sessionId || noteDraft.trim().length === 0}
              >
                해결됨으로 저장
              </button>
            </div>
            {activeReviewNotes.length > 0 ? (
              <ul className="reviewNoteList">
                {activeReviewNotes.map((note) => (
                  <li key={note.id}>
                    <strong>{note.branchName}</strong>
                    <span>{formatReviewNoteStatus(note.status)}</span>
                    <p>{note.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emptyState">아직 이 파일에 작성된 노트가 없습니다.</p>
            )}
          </section>

          <section className="publishPanel">
            <div className="reviewNotesHeading">
              <div>
                <h3>풀 리퀘스트 게시</h3>
                <p>
                  리뷰 편집 내용을 저장한 뒤 비교 브랜치에서 GitHub PR을 생성하거나 업데이트합니다.
                </p>
              </div>
              <label>
                <span>헤드 브랜치</span>
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
                <span>업데이트할 PR 번호</span>
                <input
                  inputMode="numeric"
                  placeholder="새 PR을 만들려면 비워 두세요"
                  value={pullRequestNumber}
                  onChange={(event) => setPullRequestNumber(event.target.value)}
                />
              </label>
              <label>
                <span>제목</span>
                <input
                  placeholder={`${publishBranchName}을 ${session.baseBranch}에 병합`}
                  value={pullRequestTitle}
                  onChange={(event) => setPullRequestTitle(event.target.value)}
                />
              </label>
              <label>
                <span>본문</span>
                <textarea
                  placeholder="브랜치 변경 내용을 요약하거나 내보낸 MoreDiff 요약을 붙여 넣으세요."
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
                PR 생성
              </button>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => void handleUpdatePullRequest()}
                disabled={!connection || pullRequestNumber.trim().length === 0}
              >
                PR 업데이트
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
              const isBaseContentLoaded =
                loadedBaseContentKeys.has(key) ||
                branch.file?.baseContentLoaded === true;
              const baseContent = isBaseContentLoaded
                ? baseContents[key] ?? branch.file?.baseContent ?? ""
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
                        {formatFileStatus(branch.file?.status)} · +{branch.file?.additions} / -
                        {branch.file?.deletions}
                      </p>
                      <span className={isDirty ? "dirtyBadge" : "cleanBadge"}>
                        {isContentLoading
                          ? "파일 내용 불러오는 중"
                          : isDirty
                            ? "저장되지 않은 변경"
                            : "저장되지 않은 변경 없음"}
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
                      {savingBranchName === branch.name ? "저장 중..." : "브랜치 저장"}
                    </button>
                  </header>
                  <DiffView
                    patch={branch.file?.patch ?? "patch를 사용할 수 없습니다"}
                    mode={diffViewMode}
                  />
                  <div className="codeComparisonGrid">
                    <label>
                      <span>기준 코드</span>
                      <textarea
                        aria-label={`${selectedPath} 기준 코드`}
                        value={baseContent}
                        placeholder={
                          isContentLoading
                            ? "기준 파일 내용을 불러오는 중..."
                            : "기준 파일 내용이 아직 불러와지지 않았습니다."
                        }
                        readOnly
                      />
                    </label>
                    <label>
                      <span>{branch.name} 수정 코드</span>
                      <textarea
                        aria-label={`${branch.name} ${selectedPath} 편집기`}
                        placeholder={
                          isContentLoading
                            ? "브랜치 파일 내용을 불러오는 중..."
                            : "이 패널이 활성화되면 파일 내용이 불러와집니다."
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
                    </label>
                  </div>
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
          {aiSummaryStatus ? (
            <p className="saveNotice">{aiSummaryStatus}</p>
          ) : null}
          {aiSummary ? <pre className="exportPreview">{aiSummary}</pre> : null}
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

function formatFileStatus(status: string | undefined) {
  switch (status) {
    case "added":
      return "추가됨";
    case "modified":
      return "수정됨";
    case "deleted":
      return "삭제됨";
    case "renamed":
      return "이름 변경됨";
    default:
      return "알 수 없음";
  }
}

function formatReviewNoteStatus(status: ReviewNote["status"]) {
  return status === "resolved" ? "해결됨" : "열림";
}
