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

interface OAuthConfigResult {
  configured: boolean;
  callbackUrl: string;
  requiredEnv: string[];
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

type AuthMode = "oauth" | "pat";

export function PatConnectionForm() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>("oauth");
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [baseBranch, setBaseBranch] = useState("");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRepositories, setIsLoadingRepositories] = useState(false);
  const [isCheckingOAuth, setIsCheckingOAuth] = useState(false);
  const [isOAuthSetupOpen, setIsOAuthSetupOpen] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [loadedViewerLogin, setLoadedViewerLogin] = useState("");
  const [oauthViewerLogin, setOauthViewerLogin] = useState("");
  const [oauthConfig, setOauthConfig] = useState<OAuthConfigResult | null>(null);
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
    void loadOAuthConfig();
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

  async function loadOAuthConfig() {
    try {
      const response = await fetch("/api/github/oauth/config", {
        cache: "no-store",
      });
      const payload = (await response.json()) as OAuthConfigResult;
      if (!response.ok) {
        throw new Error(payload.error ?? "GitHub OAuth 설정을 확인하지 못했습니다");
      }

      setOauthConfig(payload);
      setIsOAuthSetupOpen(!payload.configured);
    } catch {
      setOauthConfig({
        configured: false,
        callbackUrl: `${window.location.origin}/api/github/oauth/callback`,
        requiredEnv: ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET"],
      });
      setIsOAuthSetupOpen(true);
    }
  }

  function handleOAuthLoginClick() {
    if (!oauthConfig?.configured) {
      setAuthMode("oauth");
      setError("");
      setIsOAuthSetupOpen(true);
      return;
    }

    window.location.href = "/api/github/oauth/start";
  }

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
      // 서버 저장이 불가능해도 로컬 세션 메타데이터는 계속 사용할 수 있습니다.
      return null;
    }
  }

  async function handleLoadPullRequests() {
    if (!result) {
      setPullRequestError("풀 리퀘스트를 불러오기 전에 저장소 접근 권한을 확인하세요");
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
        throw new Error(payload.error ?? "풀 리퀘스트를 불러오지 못했습니다");
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
          : "풀 리퀘스트를 불러오지 못했습니다",
      );
    } finally {
      setIsLoadingPullRequests(false);
    }
  }

  function togglePullRequest(pullRequest: ImportedPullRequest) {
    if (!pullRequest.isSameRepository) {
      setPullRequestError(
        "포크 풀 리퀘스트는 GitHub에서 확인할 수 있지만, 브랜치 저장은 같은 저장소 브랜치로 제한됩니다.",
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
      setPullRequestError("같은 저장소의 풀 리퀘스트를 2개 이상 6개 이하로 선택하세요");
      return;
    }
    if (uniqueBaseBranches.size !== 1) {
      setPullRequestError("선택한 풀 리퀘스트는 하나의 기준 브랜치를 공유해야 합니다");
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
        "선택한 PR의 헤드 브랜치가 모두 저장소에 존재해야 합니다",
      );
      return;
    }

    setBaseBranch(nextBaseBranch);
    setSelectedBranches(nextCompareBranches);
    setPullRequestError("");
  }

  async function handleLoadRepositories() {
    if (!hasGitHubAuthentication) {
      setError("먼저 GitHub로 로그인하거나 PAT를 입력하세요");
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
        throw new Error(payload.error ?? "저장소를 불러오지 못했습니다");
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
          : "저장소 불러오기에 실패했습니다",
      );
    } finally {
      setIsLoadingRepositories(false);
    }
  }

  async function handleValidate() {
    if (!hasGitHubAuthentication) {
      setError("먼저 GitHub로 로그인하거나 PAT를 입력하세요");
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
        throw new Error(payload.error ?? "토큰 검증에 실패했습니다");
      }
      if (!payload.repository) {
        throw new Error("접근 권한을 확인하기 전에 저장소를 선택하세요");
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
        caughtError instanceof Error ? caughtError.message : "검증에 실패했습니다",
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
      setError("비교 브랜치를 2개 이상 6개 이하로 선택하세요");
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
      setError("저장된 세션을 다시 열기 전에 GitHub로 로그인하거나 PAT를 입력하세요");
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
        <h1>GitHub 연결</h1>
        <p>
          GitHub OAuth로 로그인하거나 fine-grained PAT를 대체 수단으로 사용할 수
          있습니다. 저장된 비교 세션에는 토큰이 아니라 저장소와 브랜치 메타데이터만
          보관됩니다.
        </p>
      </div>

      <div className="authTabs" role="tablist" aria-label="GitHub 인증 방식">
        <button
          type="button"
          role="tab"
          aria-selected={authMode === "oauth"}
          className={authMode === "oauth" ? "active" : ""}
          onClick={() => setAuthMode("oauth")}
        >
          GitHub로 로그인
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authMode === "pat"}
          className={authMode === "pat" ? "active" : ""}
          onClick={() => setAuthMode("pat")}
        >
          PAT로 직접 연결
        </button>
      </div>

      {authMode === "oauth" ? (
        <section className="authCard">
          <div>
            <h2>GitHub OAuth</h2>
            <p>
              {oauthViewerLogin
                ? `${oauthViewerLogin} 계정으로 로그인했습니다.`
                : isCheckingOAuth
                  ? "GitHub OAuth 세션을 확인하는 중입니다..."
                  : oauthConfig?.configured
                    ? "PAT를 직접 입력하지 않고 GitHub 인증 세션으로 저장소를 불러옵니다."
                    : "OAuth 앱 설정이 아직 없어 로그인 대신 설정 안내를 먼저 보여줍니다."}
            </p>
          </div>
          <div className="authActions">
            {oauthViewerLogin ? (
              <button
                type="button"
                className="secondaryButton"
                onClick={handleDisconnectOAuth}
              >
                연결 해제
              </button>
            ) : (
              <button
                type="button"
                className="primaryMiniButton"
                onClick={handleOAuthLoginClick}
              >
                GitHub로 로그인
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="authCard patAuthCard">
          <div>
            <h2>PAT로 직접 연결</h2>
            <p>
              로컬 테스트나 OAuth 설정 전에는 fine-grained PAT와 저장소 URL만으로
              브랜치 비교를 시작할 수 있습니다. PAT는 저장하지 않습니다.
            </p>
          </div>
          <label className="formField inlineFormField">
            <span>Fine-grained PAT</span>
            <input
              placeholder="github_pat_..."
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
        </section>
      )}

      {authMode === "oauth" && isOAuthSetupOpen && !oauthConfig?.configured ? (
        <section className="oauthSetupCard">
          <div>
            <h3>OAuth 설정이 필요합니다</h3>
            <p>
              GitHub OAuth App을 만든 뒤 아래 callback URL과 환경 변수를
              설정하면 `GitHub로 로그인` 버튼이 실제 로그인으로 연결됩니다.
            </p>
          </div>
          <label>
            <span>GitHub OAuth callback URL</span>
            <code>{oauthConfig?.callbackUrl ?? "/api/github/oauth/callback"}</code>
          </label>
          <pre>{`GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...`}</pre>
          <div className="oauthSetupActions">
            <a
              href="https://github.com/settings/developers"
              rel="noreferrer"
              target="_blank"
            >
              GitHub OAuth App 만들기
            </a>
            <Link href="/compare?mode=demo">데모 먼저 보기</Link>
          </div>
          <p className="hintText">
            설정 후 개발 서버를 재시작하세요. 당장 테스트하려면 `PAT로 직접 연결`
            탭을 사용하면 됩니다.
          </p>
        </section>
      ) : null}

      {recentSessions.length > 0 ? (
        <section className="recentSessionsCard">
          <div className="recentSessionsHeading">
            <div>
              <h2>최근 비교 세션</h2>
              <p>
                OAuth 또는 입력한 PAT로 저장된 저장소와 브랜치 메타데이터를 다시
                엽니다. 저장된 세션에는 토큰이 보관되지 않습니다.
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
                      기준 <strong>{session.baseBranch}</strong>
                    </span>
                    <span>
                      비교 <strong>{session.compareBranches.join(", ")}</strong>
                    </span>
                    {session.pullRequests.length > 0 ? (
                      <span>
                        PR{" "}
                        <strong>
                          {session.pullRequests
                            .map((pullRequest) => `#${pullRequest.number}`)
                            .join(", ")}
                        </strong>
                      </span>
                    ) : null}
                    <time dateTime={session.savedAt}>
                      저장됨 {formatSavedAt(session.savedAt)}
                    </time>
                    {session.lastOpenedAt ? (
                      <time dateTime={session.lastOpenedAt}>
                        열림 {formatSavedAt(session.lastOpenedAt)}
                      </time>
                    ) : null}
                  </div>
                  <div className="recentSessionActions">
                    <button
                      type="button"
                      className="primaryMiniButton"
                      onClick={() => handleReopenRecentSession(session)}
                    >
                      다시 열기
                    </button>
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => handleReuseRecentSession(session)}
                    >
                      {isPending ? "검증 대상으로 선택됨" : "구성 재사용"}
                    </button>
                    <button
                      type="button"
                      className="dangerButton"
                      onClick={() => handleRemoveRecentSession(session.id)}
                    >
                      삭제
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="actionsRow">
        <button
          type="button"
          onClick={handleLoadRepositories}
          disabled={isLoadingRepositories}
        >
          {isLoadingRepositories ? "저장소 불러오는 중..." : "저장소 불러오기"}
        </button>
      </div>

      {loadedViewerLogin ? (
        <p className="hintText">
          <strong>{loadedViewerLogin}</strong> 계정의 저장소 접근 권한을 불러왔습니다.
        </p>
      ) : null}

      {repositoryOptions.length > 0 ? (
        <label className="formField">
          <span>접근 가능한 저장소</span>
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
                {repository.isPrivate ? " (비공개)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="formField">
        <span>저장소 URL</span>
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
          {isSubmitting ? "검증 중..." : "접근 권한 검증"}
        </button>
        <Link href="/compare?mode=demo" className="secondaryAction">
          데모 작업 공간 열기
        </Link>
      </div>

      {error ? <p className="errorNotice">{error}</p> : null}

      {result ? (
        <div className="resultCard">
          <h2>연결이 검증되었습니다</h2>
          <p>
            <strong>{result.viewerLogin}</strong> 계정으로 로그인했습니다
          </p>
          <p>
            저장소:{" "}
            <strong>
              {result.repository.owner}/{result.repository.name}
            </strong>
          </p>
          <p>
            기본 브랜치: <strong>{result.repository.defaultBranch}</strong>
          </p>
          <p>
            불러온 브랜치: <strong>{result.branches.length}</strong>
          </p>
          <section className="pullRequestImportCard">
            <div className="pullRequestImportHeading">
              <div>
                <h3>풀 리퀘스트 가져오기</h3>
                <p>
                  같은 저장소의 PR을 2개에서 6개까지 선택하면 현재 PR 헤드를 기준으로
                  공통 기준 브랜치와 비교 브랜치가 자동 입력됩니다.
                </p>
              </div>
              <div className="pullRequestActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={handleLoadPullRequests}
                  disabled={isLoadingPullRequests}
                >
                  {isLoadingPullRequests ? "PR 새로고침 중..." : "PR 불러오기 / 새로고침"}
                </button>
                <button
                  type="button"
                  onClick={applySelectedPullRequests}
                  disabled={selectedPullRequestNumbers.length < 2}
                >
                  선택한 PR 적용
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
                        {pullRequest.isSameRepository ? "" : " - 포크 읽기 전용"}
                      </small>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="hintText">
                세션 구성을 GitHub PR 헤드에 맞추려면 열린 PR을 불러오세요.
              </p>
            )}
          </section>
          {pendingRecentSessionId ? (
            <p className="hintText">
              일치하는 브랜치가 있는 범위에서 최근 세션 구성이 적용되었습니다.
            </p>
          ) : null}

          <div className="branchConfig">
            <label className="formField">
              <span>기준 브랜치</span>
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
              <span>비교 브랜치</span>
              <p className="hintText">
                비교 브랜치를 2개 이상 6개 이하로 선택하세요.
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
                {isLaunching ? "여는 중..." : "실시간 비교 열기"}
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
    return "최근";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
