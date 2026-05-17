"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { LIVE_COMPARE_STORAGE_KEY } from "@/src/domain/compare-launch";
import type { ImportedPullRequest } from "@/src/domain/types";
import {
  markRecentCompareSessionOpened,
  mergeRecentCompareSessions,
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

interface OAuthSessionResult {
  authenticated: boolean;
  viewerLogin?: string;
  repositories?: RepositoryOption[];
  error?: string;
}

interface PersistedCompareSessionsResult {
  sessions: RecentCompareSession[];
  error?: string;
}

interface PersistedCompareSessionResult {
  session?: RecentCompareSession;
  error?: string;
}

interface PullRequestsResult {
  pullRequests: ImportedPullRequest[];
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
  const [isCheckingOAuth, setIsCheckingOAuth] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [loadedViewerLogin, setLoadedViewerLogin] = useState("");
  const [oauthViewerLogin, setOauthViewerLogin] = useState("");
  const [repositoryOptions, setRepositoryOptions] = useState<RepositoryOption[]>(
    [],
  );
  const [recentSessions, setRecentSessions] = useState<RecentCompareSession[]>(
    [],
  );
  const [pullRequests, setPullRequests] = useState<ImportedPullRequest[]>([]);
  const [selectedPullRequestNumbers, setSelectedPullRequestNumbers] = useState<
    number[]
  >([]);
  const [pendingRecentSessionId, setPendingRecentSessionId] = useState("");
  const [isLoadingPullRequests, setIsLoadingPullRequests] = useState(false);
  const [pullRequestError, setPullRequestError] = useState("");

  const compareBranchOptions = useMemo(
    () =>
      (result?.branches ?? []).filter((branch) => branch.name !== baseBranch),
    [baseBranch, result],
  );
  const selectedPullRequests = pullRequests.filter((pullRequest) =>
    selectedPullRequestNumbers.includes(pullRequest.number),
  );

  useEffect(() => {
    setRecentSessions(readRecentCompareSessions());
    void hydrateOAuthSession();
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

  const hasGitHubAuthentication =
    token.trim().length > 0 || oauthViewerLogin.trim().length > 0;

  async function hydrateOAuthSession() {
    setIsCheckingOAuth(true);
    try {
      const response = await fetch("/api/github/oauth/session", {
        cache: "no-store",
      });
      const payload = (await response.json()) as OAuthSessionResult;
      if (!payload.authenticated) {
        return;
      }

      setOauthViewerLogin(payload.viewerLogin ?? "");
      setLoadedViewerLogin(payload.viewerLogin ?? "");
      setRepositoryOptions(payload.repositories ?? []);
      if (!repoUrl.trim() && payload.repositories?.[0]) {
        setRepoUrl(payload.repositories[0].url);
      }
      await mergePersistedSessions();
    } catch {
      setOauthViewerLogin("");
    } finally {
      setIsCheckingOAuth(false);
    }
  }

  async function handleDisconnectOAuth() {
    await fetch("/api/github/oauth/session", {
      method: "DELETE",
    });
    setOauthViewerLogin("");
    if (!token.trim()) {
      setLoadedViewerLogin("");
      setRepositoryOptions([]);
      setResult(null);
    }
  }

  async function mergePersistedSessions(tokenOverride = "") {
    const headers: HeadersInit = tokenOverride
      ? {
          "x-morediff-token": tokenOverride,
        }
      : {};
    const response = await fetch("/api/compare/sessions", {
      headers,
      cache: "no-store",
    });
    const payload = (await response.json()) as PersistedCompareSessionsResult;
    if (!response.ok) {
      return;
    }

    const nextSessions = mergeRecentCompareSessions(
      readRecentCompareSessions(),
      payload.sessions,
    );
    setRecentSessions(nextSessions);
    writeRecentCompareSessions(nextSessions);
  }

  async function persistRecentSessionToServer(
    session: RecentCompareSession,
    markOpened: boolean,
  ): Promise<RecentCompareSession | null> {
    try {
      const response = await fetch("/api/compare/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: token.trim(),
          repoUrl: session.repoUrl,
          baseBranch: session.baseBranch,
          compareBranches: session.compareBranches,
          branchHeads: session.branchHeads,
          pullRequests: session.pullRequests,
          markOpened,
        }),
      });
      const payload = (await response.json()) as PersistedCompareSessionResult;
      if (!response.ok) {
        return null;
      }

      return payload.session ?? null;
    } catch {
      // Local session metadata remains usable even if server persistence is unavailable.
      return null;
    }
  }

  async function handleLoadPullRequests() {
    if (!result) {
      setPullRequestError("validate repository access before loading pull requests");
      return;
    }

    setIsLoadingPullRequests(true);
    setPullRequestError("");

    try {
      const query = new URLSearchParams({
        repoUrl,
      });
      const headers: HeadersInit = token.trim()
        ? {
            "x-morediff-token": token.trim(),
          }
        : {};
      const response = await fetch(`/api/github/pulls?${query.toString()}`, {
        headers,
        cache: "no-store",
      });
      const payload = (await response.json()) as PullRequestsResult;
      if (!response.ok) {
        throw new Error(payload.error ?? "failed to load pull requests");
      }

      setPullRequests(payload.pullRequests);
      setSelectedPullRequestNumbers((current) =>
        current.filter((number) =>
          payload.pullRequests.some((pullRequest) => pullRequest.number === number),
        ),
      );
    } catch (caughtError) {
      setPullRequestError(
        caughtError instanceof Error
          ? caughtError.message
          : "failed to load pull requests",
      );
    } finally {
      setIsLoadingPullRequests(false);
    }
  }

  function togglePullRequest(pullRequest: ImportedPullRequest) {
    if (!pullRequest.isSameRepository) {
      setPullRequestError(
        "Fork pull requests can be reviewed from GitHub, but branch writeback is limited to same-repository branches.",
      );
      return;
    }

    setPullRequestError("");
    setSelectedPullRequestNumbers((current) => {
      if (current.includes(pullRequest.number)) {
        return current.filter((number) => number !== pullRequest.number);
      }

      if (current.length >= 6) {
        return current;
      }

      return [...current, pullRequest.number];
    });
  }

  function applySelectedPullRequests() {
    if (!result) {
      return;
    }

    const selected = pullRequests.filter((pullRequest) =>
      selectedPullRequestNumbers.includes(pullRequest.number),
    );
    const sameRepositoryPullRequests = selected.filter(
      (pullRequest) => pullRequest.isSameRepository,
    );
    const uniqueBaseBranches = new Set(
      sameRepositoryPullRequests.map((pullRequest) => pullRequest.baseBranch),
    );
    if (
      sameRepositoryPullRequests.length < 2 ||
      sameRepositoryPullRequests.length > 6
    ) {
      setPullRequestError("select between 2 and 6 same-repository pull requests");
      return;
    }
    if (uniqueBaseBranches.size !== 1) {
      setPullRequestError("selected pull requests must share one base branch");
      return;
    }

    const nextBaseBranch = sameRepositoryPullRequests[0].baseBranch;
    const branchNames = new Set(result.branches.map((branch) => branch.name));
    const nextCompareBranches = sameRepositoryPullRequests
      .map((pullRequest) => pullRequest.headBranch)
      .filter(
        (branch, index, branches) =>
          branch !== nextBaseBranch &&
          branchNames.has(branch) &&
          branches.indexOf(branch) === index,
      );
    if (nextCompareBranches.length !== sameRepositoryPullRequests.length) {
      setPullRequestError(
        "all selected PR head branches must still exist in the repository",
      );
      return;
    }

    setBaseBranch(nextBaseBranch);
    setSelectedBranches(nextCompareBranches);
    setPullRequestError("");
  }

  async function handleLoadRepositories() {
    if (!hasGitHubAuthentication) {
      setError("sign in with GitHub or enter a PAT first");
      return;
    }

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
          token: token.trim(),
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
      await mergePersistedSessions(token.trim());
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
    if (!hasGitHubAuthentication) {
      setError("sign in with GitHub or enter a PAT first");
      return;
    }

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
          token: token.trim(),
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

    const importedPullRequests = selectedPullRequests.filter(
      (pullRequest) =>
        pullRequest.baseBranch === baseBranch &&
        selectedBranches.includes(pullRequest.headBranch),
    );
    const branchHeads = Object.fromEntries(
      result.branches
        .filter(
          (branch) =>
            branch.name === baseBranch || selectedBranches.includes(branch.name),
        )
        .map((branch) => [branch.name, branch.headSha]),
    );
    for (const pullRequest of importedPullRequests) {
      branchHeads[pullRequest.headBranch] = pullRequest.headSha;
    }
    const nextRecentSessions = upsertRecentCompareSession(recentSessions, {
      repoUrl,
      baseBranch,
      compareBranches: selectedBranches,
      branchHeads,
      pullRequests: importedPullRequests,
    }, { markOpened: true });
    const nextSession = nextRecentSessions[0];
    setRecentSessions(nextRecentSessions);
    writeRecentCompareSessions(nextRecentSessions);
    const persistedSession = await persistRecentSessionToServer(nextSession, true);
    const launchSession = persistedSession ?? nextSession;
    if (persistedSession) {
      const mergedSessions = mergeRecentCompareSessions(
        nextRecentSessions.filter((session) => session.id !== nextSession.id),
        [persistedSession],
      );
      setRecentSessions(mergedSessions);
      writeRecentCompareSessions(mergedSessions);
    }

    window.sessionStorage.setItem(
      LIVE_COMPARE_STORAGE_KEY,
      JSON.stringify({
        sessionId: launchSession.id,
        token: token.trim(),
        repoUrl,
        baseBranch,
        compareBranches: selectedBranches,
        pullRequests: importedPullRequests,
      }),
    );

    router.push("/compare");
  }

  async function handleReopenRecentSession(session: RecentCompareSession) {
    if (!hasGitHubAuthentication) {
      setError("sign in with GitHub or enter a PAT before reopening a saved session");
      return;
    }

    const nextRecentSessions = markRecentCompareSessionOpened(
      recentSessions,
      session.id,
    );
    setRecentSessions(nextRecentSessions);
    writeRecentCompareSessions(nextRecentSessions);
    const persistedSession = await persistRecentSessionToServer(session, true);
    const launchSession = persistedSession ?? {
      ...session,
      lastOpenedAt:
        nextRecentSessions.find((candidate) => candidate.id === session.id)
          ?.lastOpenedAt ?? session.lastOpenedAt,
    };
    if (persistedSession && persistedSession.id !== session.id) {
      const mergedSessions = mergeRecentCompareSessions(
        nextRecentSessions.filter((candidate) => candidate.id !== session.id),
        [persistedSession],
      );
      setRecentSessions(mergedSessions);
      writeRecentCompareSessions(mergedSessions);
    }

    window.sessionStorage.setItem(
      LIVE_COMPARE_STORAGE_KEY,
      JSON.stringify({
        sessionId: launchSession.id,
        token: token.trim(),
        repoUrl: launchSession.repoUrl,
        baseBranch: launchSession.baseBranch,
        compareBranches: launchSession.compareBranches,
        pullRequests: launchSession.pullRequests,
      }),
    );

    router.push(`/compare?session=${encodeURIComponent(session.id)}`);
  }

  function handleReuseRecentSession(session: RecentCompareSession) {
    setRepoUrl(session.repoUrl);
    setResult(null);
    setError("");
    setPullRequests(session.pullRequests);
    setSelectedPullRequestNumbers(
      session.pullRequests.map((pullRequest) => pullRequest.number),
    );
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
        <h1>Connect GitHub</h1>
        <p>
          Sign in with GitHub OAuth or use a fine-grained PAT fallback. Saved
          compare sessions keep repository and branch metadata only, not tokens.
        </p>
      </div>

      <section className="authCard">
        <div>
          <h2>GitHub OAuth</h2>
          <p>
            {oauthViewerLogin
              ? `Signed in as ${oauthViewerLogin}.`
              : isCheckingOAuth
                ? "Checking GitHub OAuth session..."
                : "Recommended for reopening sessions without storing tokens in the browser."}
          </p>
        </div>
        <div className="authActions">
          {oauthViewerLogin ? (
            <button
              type="button"
              className="secondaryButton"
              onClick={handleDisconnectOAuth}
            >
              Disconnect
            </button>
          ) : (
            <a className="primaryAction" href="/api/github/oauth/start">
              Sign in with GitHub
            </a>
          )}
        </div>
      </section>

      {recentSessions.length > 0 ? (
        <section className="recentSessionsCard">
          <div className="recentSessionsHeading">
            <div>
              <h2>Recent compare sessions</h2>
              <p>
                Reopen saved repository and branch metadata with OAuth or the PAT
                you enter. Tokens are not stored in saved sessions.
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
                    {session.pullRequests.length > 0 ? (
                      <span>
                        PRs{" "}
                        <strong>
                          {session.pullRequests
                            .map((pullRequest) => `#${pullRequest.number}`)
                            .join(", ")}
                        </strong>
                      </span>
                    ) : null}
                    <time dateTime={session.savedAt}>
                      Saved {formatSavedAt(session.savedAt)}
                    </time>
                    {session.lastOpenedAt ? (
                      <time dateTime={session.lastOpenedAt}>
                        Opened {formatSavedAt(session.lastOpenedAt)}
                      </time>
                    ) : null}
                  </div>
                  <div className="recentSessionActions">
                    <button
                      type="button"
                      className="primaryMiniButton"
                      onClick={() => handleReopenRecentSession(session)}
                    >
                      Reopen
                    </button>
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
              setPullRequests([]);
              setSelectedPullRequestNumbers([]);
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
            setPullRequests([]);
            setSelectedPullRequestNumbers([]);
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
            Visible branches loaded: <strong>{result.branches.length}</strong>
          </p>
          <section className="pullRequestImportCard">
            <div className="pullRequestImportHeading">
              <div>
                <h3>Import pull requests</h3>
                <p>
                  Select 2 to 6 same-repository PRs to auto-fill the shared base
                  branch and compare branches from current PR heads.
                </p>
              </div>
              <div className="pullRequestActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={handleLoadPullRequests}
                  disabled={isLoadingPullRequests}
                >
                  {isLoadingPullRequests ? "Refreshing PRs..." : "Load / refresh PRs"}
                </button>
                <button
                  type="button"
                  onClick={applySelectedPullRequests}
                  disabled={selectedPullRequestNumbers.length < 2}
                >
                  Apply selected PRs
                </button>
              </div>
            </div>
            {pullRequestError ? (
              <p className="errorNotice">{pullRequestError}</p>
            ) : null}
            {pullRequests.length > 0 ? (
              <div className="pullRequestList">
                {pullRequests.map((pullRequest) => {
                  const checked = selectedPullRequestNumbers.includes(
                    pullRequest.number,
                  );
                  return (
                    <label
                      className={
                        pullRequest.isSameRepository
                          ? "pullRequestOption"
                          : "pullRequestOption disabled"
                      }
                      key={pullRequest.number}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!pullRequest.isSameRepository}
                        onChange={() => togglePullRequest(pullRequest)}
                      />
                      <span>
                        #{pullRequest.number} {pullRequest.title}
                      </span>
                      <small>
                        {pullRequest.headBranch} {"->"} {pullRequest.baseBranch}
                        {pullRequest.isSameRepository ? "" : " - fork read-only"}
                      </small>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="hintText">
                Load open PRs when you want the session shape to follow GitHub PR
                heads.
              </p>
            )}
          </section>
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
