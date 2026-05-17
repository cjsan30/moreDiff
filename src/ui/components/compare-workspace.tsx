"use client";

import { useState } from "react";

import type { CompareSessionViewModel } from "@/src/domain/types";

type FileFilter = "any" | "overlap" | "all" | "branch";

interface CompareWorkspaceProps {
  session: CompareSessionViewModel;
  connection?: {
    token: string;
    repoUrl: string;
  };
}

export function CompareWorkspace({ session, connection }: CompareWorkspaceProps) {
  const [activePath, setActivePath] = useState(session.fileMatrix[0]?.path ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      session.branches.flatMap((branch) =>
        branch.files.map((file) => [
          `${branch.name}:${file.path}`,
          file.content,
        ]),
      ),
    ),
  );
  const [lastSaved, setLastSaved] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [savingBranchName, setSavingBranchName] = useState<string>("");
  const [fileFilter, setFileFilter] = useState<FileFilter>("any");
  const [filterBranchName, setFilterBranchName] = useState(
    session.branches[0]?.name ?? "",
  );

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

  async function handleSaveBranch(
    branchName: string,
    expectedHeadSha: string,
    path: string,
    content: string,
  ) {
    if (!connection) {
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
          path,
          content,
          message: `Update ${path} from MoreDiff`,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "failed to save branch file");
      }

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
          </p>
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
          <ul className="fileList">
            {filteredRows.map((row) => {
              const changedCount = row.branches.filter((branch) => branch.changed).length;
              const isOverlap = changedCount > 1;
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
                  </button>
                </li>
              );
            })}
          </ul>
          {filteredRows.length === 0 ? (
            <p className="emptyState">No files match this filter.</p>
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

          <div className="editorGrid">
            {activeBranches.map((branch) => {
              const key = `${branch.name}:${selectedPath}`;
              const content = drafts[key] ?? branch.file?.content ?? "";
              return (
                <article className="editorCard" key={key}>
                  <header>
                    <div>
                      <h3>{branch.name}</h3>
                      <p>
                        {branch.file?.status} · +{branch.file?.additions} / -
                        {branch.file?.deletions}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveBranch(
                          branch.name,
                          branch.headSha,
                          selectedPath,
                          content,
                        )
                      }
                      disabled={savingBranchName === branch.name}
                    >
                      {savingBranchName === branch.name ? "Saving..." : "Save branch"}
                    </button>
                  </header>
                  <pre className="patchBlock">{branch.file?.patch}</pre>
                  <textarea
                    aria-label={`Editor for ${branch.name} ${selectedPath}`}
                    value={content}
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
          {saveError ? <p className="errorNotice">{saveError}</p> : null}
        </section>
      </section>
    </main>
  );
}
