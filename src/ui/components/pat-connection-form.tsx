"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { LIVE_COMPARE_STORAGE_KEY } from "@/src/domain/compare-launch";
import {
  type RecentCompareSession,
  readRecentCompareSessions,
  upsertRecentCompareSession,
  writeRecentCompareSessions,
} from "@/src/ui/components/recent-compare-sessions";

interface ValidationResult {
  viewerLogin: string;
  repository: {
    owner: string;
    name: string;
    isPrivate: boolean;
    defaultBranch: string;
  };
  branches: Array<{
    name: string;
    headSha: string;
  }>;
  repositories: RepositoryOption[];
}

interface ConnectionProbeResult {
  viewerLogin: string;
  repository: ValidationResult["repository"] | null;
  branches: ValidationResult["branches"];
  repositories: RepositoryOption[];
  error?: string;
}

interface RepositoryOption {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export function PatConnectionForm() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [baseBranch, setBaseBranch] = useState("");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRepositories, setIsLoadingRepositories] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [loadedViewerLogin, setLoadedViewerLogin] = useState("");
  const [repositoryOptions, setRepositoryOptions] = useState<RepositoryOption[]>(
    [],
  );
  const [recentSessions, setRecentSessions] = useState<RecentCompareSession[]>(
    [],
  );
  const [pendingRecentSessionId, setPendingRecentSessionId] = useState("");

  const compareBranchOptions = useMemo(
    () =>
      (result?.branches ?? []).filter((branch) => branch.name !== baseBranch),
    [baseBranch, result],
  );

  useEffect(() => {
    setRecentSessions(readRecentCompareSessions());
  }, []);

  useEffect(() => {
    if (!result || !pendingRecentSessionId) {
      return;
    }

    const pendingSession = recentSessions.find(
      (session) => session.id === pendingRecentSessionId,
    );
    if (!pendingSession) {
      setPendingRecentSessionId("");
      return;
    }

    applySessionShape(result, pendingSession, setBaseBranch, setSelectedBranches);
    setPendingRecentSessionId("");
  }, [pendingRecentSessionId, recentSessions, result]);

  async function handleLoadRepositories() {
    setIsLoadingRepositories(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/github/validate-pat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
        }),
      });

      const payload = (await response.json()) as ConnectionProbeResult;
      if (!response.ok) {
        throw new Error(payload.error ?? "failed to load repositories");
      }

      setLoadedViewerLogin(payload.viewerLogin);
      setRepositoryOptions(payload.repositories);
      if (!repoUrl.trim() && payload.repositories[0]) {
        setRepoUrl(payload.repositories[0].url);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "repository loading failed",
      );
    } finally {
      setIsLoadingRepositories(false);
    }
  }

  async function handleValidate() {
    setIsSubmitting(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/github/validate-pat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoUrl,
          token,
        }),
      });

      const payload = (await response.json()) as ConnectionProbeResult;

      if (!response.ok) {
        throw new Error(payload.error ?? "failed to validate token");
      }
      if (!payload.repository) {
        throw new Error("select a repository before validating access");
      }
      const validationResult: ValidationResult = {
        viewerLogin: payload.viewerLogin,
        repository: payload.repository,
        branches: payload.branches,
        repositories: payload.repositories,
      };

      setLoadedViewerLogin(payload.viewerLogin);
      setRepositoryOptions(payload.repositories);
      setResult(validationResult);
      const pendingSession = recentSessions.find(
        (session) =>
          session.id === pendingRecentSessionId ||
          session.repoUrl.trim() === repoUrl.trim(),
      );

      if (pendingSession) {
        applySessionShape(
          validationResult,
          pendingSession,
          setBaseBranch,
          setSelectedBranches,
        );
      } else {
        applySessionShape(validationResult, null, setBaseBranch, setSelectedBranches);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "validation failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleCompareBranch(branchName: string) {
    setSelectedBranches((current) => {
      if (current.includes(branchName)) {
        return current.filter((branch) => branch !== branchName);
      }

      if (current.length >= 6) {
        return current;
      }

      return [...current, branchName];
    });
  }

  async function handleLaunchLiveCompare() {
    if (!result) {
      return;
    }

    if (selectedBranches.length < 2 || selectedBranches.length > 6) {
      setError("select between 2 and 6 compare branches");
      return;
    }

    setIsLaunching(true);
    setError("");

    const nextRecentSessions = upsertRecentCompareSession(recentSessions, {
      repoUrl,
      baseBranch,
      compareBranches: selectedBranches,
    });
    setRecentSessions(nextRecentSessions);
    writeRecentCompareSessions(nextRecentSessions);

    window.sessionStorage.setItem(
      LIVE_COMPARE_STORAGE_KEY,
      JSON.stringify({
        token,
        repoUrl,
        baseBranch,
        compareBranches: selectedBranches,
      }),
    );

    router.push("/compare");
  }

  function handleReuseRecentSession(session: RecentCompareSession) {
    setRepoUrl(session.repoUrl);
    setResult(null);
    setError("");
    setPendingRecentSessionId(session.id);
  }

  function handleRemoveRecentSession(sessionId: string) {
    const nextRecentSessions = recentSessions.filter(
      (session) => session.id !== sessionId,
    );
    setRecentSessions(nextRecentSessions);
    writeRecentCompareSessions(nextRecentSessions);

    if (pendingRecentSessionId === sessionId) {
      setPendingRecentSessionId("");
    }
  }

  return (
    <section className="connectPanel">
      <div className="panelHeading">
        <h1>Connect a repository with a fine-grained PAT</h1>
        <p>
          MoreDiff will validate the token against the repository you enter. This
          bootstrap only validates live access. It does not persist the token yet.
        </p>
      </div>

      {recentSessions.length > 0 ? (
        <section className="recentSessionsCard">
          <div className="recentSessionsHeading">
            <div>
              <h2>Recent compare sessions</h2>
              <p>
                Reuse a saved repository and branch shape after validating a PAT.
              </p>
            </div>
          </div>

          <div className="recentSessionsList">
            {recentSessions.map((session) => {
              const isPending = pendingRecentSessionId === session.id;
              return (
                <article className="recentSessionItem" key={session.id}>
                  <div className="recentSessionMeta">
                    <strong>{session.repoUrl}</strong>
                    <span>
                      Base <strong>{session.baseBranch}</strong>
                    </span>
                    <span>
                      Compare <strong>{session.compareBranches.join(", ")}</strong>
                    </span>
                    <time dateTime={session.savedAt}>
                      Saved {formatSavedAt(session.savedAt)}
                    </time>
                  </div>
                  <div className="recentSessionActions">
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => handleReuseRecentSession(session)}
                    >
                      {isPending ? "Selected for validation" : "Reuse shape"}
                    </button>
                    <button
                      type="button"
                      className="dangerButton"
                      onClick={() => handleRemoveRecentSession(session.id)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <label className="formField">
        <span>Fine-grained PAT</span>
        <input
          placeholder="github_pat_..."
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>

      <div className="actionsRow">
        <button
          type="button"
          onClick={handleLoadRepositories}
          disabled={isLoadingRepositories}
        >
          {isLoadingRepositories ? "Loading repositories..." : "Load repositories"}
        </button>
      </div>

      {loadedViewerLogin ? (
        <p className="hintText">
          Repository access loaded for <strong>{loadedViewerLogin}</strong>.
        </p>
      ) : null}

      {repositoryOptions.length > 0 ? (
        <label className="formField">
          <span>Accessible repositories</span>
          <select
            value={repoUrl}
            onChange={(event) => {
              setRepoUrl(event.target.value);
              setResult(null);
            }}
          >
            {repositoryOptions.map((repository) => (
              <option key={repository.fullName} value={repository.url}>
                {repository.fullName}
                {repository.isPrivate ? " (private)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="formField">
        <span>Repository URL</span>
        <input
          placeholder="https://github.com/owner/repository"
          value={repoUrl}
          onChange={(event) => {
            setRepoUrl(event.target.value);
            setResult(null);
          }}
        />
      </label>

      <div className="actionsRow">
        <button type="button" onClick={handleValidate} disabled={isSubmitting}>
          {isSubmitting ? "Validating..." : "Validate access"}
        </button>
        <Link href="/compare?mode=demo" className="secondaryAction">
          Open demo workspace
        </Link>
      </div>

      {error ? <p className="errorNotice">{error}</p> : null}

      {result ? (
        <div className="resultCard">
          <h2>Connection validated</h2>
          <p>
            Signed in as <strong>{result.viewerLogin}</strong>
          </p>
          <p>
            Repository:{" "}
            <strong>
              {result.repository.owner}/{result.repository.name}
            </strong>
          </p>
          <p>
            Default branch: <strong>{result.repository.defaultBranch}</strong>
          </p>
          <p>
            Visible branches sampled: <strong>{result.branches.length}</strong>
          </p>
          {pendingRecentSessionId ? (
            <p className="hintText">
              A recent session shape was applied where matching branches were
              available.
            </p>
          ) : null}

          <div className="branchConfig">
            <label className="formField">
              <span>Base branch</span>
              <select
                value={baseBranch}
                onChange={(event) => {
                  const nextBaseBranch = event.target.value;
                  setBaseBranch(nextBaseBranch);
                  setSelectedBranches((current) =>
                    current.filter((branch) => branch !== nextBaseBranch),
                  );
                }}
              >
                {result.branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="formField">
              <span>Compare branches</span>
              <p className="hintText">
                Select between 2 and 6 compare branches.
              </p>
              <div className="branchList">
                {compareBranchOptions.map((branch) => {
                  const checked = selectedBranches.includes(branch.name);
                  return (
                    <label className="branchOption" key={branch.name}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCompareBranch(branch.name)}
                      />
                      <span>{branch.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="actionsRow">
              <button
                type="button"
                onClick={handleLaunchLiveCompare}
                disabled={isLaunching}
              >
                {isLaunching ? "Opening..." : "Open live compare"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function applySessionShape(
  validationResult: ValidationResult,
  session: Pick<
    RecentCompareSession,
    "baseBranch" | "compareBranches"
  > | null,
  setBaseBranch: (branch: string) => void,
  setSelectedBranches: (branches: string[]) => void,
) {
  const branchNames = validationResult.branches.map((branch) => branch.name);
  const nextBaseBranch =
    session && branchNames.includes(session.baseBranch)
      ? session.baseBranch
      : validationResult.repository.defaultBranch;
  const filteredCompareBranches = (session?.compareBranches ?? []).filter(
    (branch, index, branches) =>
      branch !== nextBaseBranch &&
      branchNames.includes(branch) &&
      branches.indexOf(branch) === index,
  );

  const fallbackCompareBranches = validationResult.branches
    .filter((branch) => branch.name !== nextBaseBranch)
    .slice(0, 2)
    .map((branch) => branch.name);
  const nextCompareBranches =
    filteredCompareBranches.length >= 2
      ? filteredCompareBranches.slice(0, 6)
      : fallbackCompareBranches;

  setBaseBranch(nextBaseBranch);
  setSelectedBranches(nextCompareBranches);
}

function formatSavedAt(savedAt: string) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
