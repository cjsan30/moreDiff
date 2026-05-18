"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { buildMockCompareSession } from "@/src/data/mock-session";
import {
  LIVE_COMPARE_STORAGE_KEY,
  isLiveCompareLaunchState,
} from "@/src/domain/compare-launch";
import type { CompareSessionViewModel } from "@/src/domain/types";
import { CompareWorkspace } from "@/src/ui/components/compare-workspace";

interface LoadState {
  kind: "loading" | "error" | "ready";
  message?: string;
  session?: CompareSessionViewModel;
  connection?: {
    sessionId?: string;
    token: string;
    repoUrl: string;
  };
}

export function LiveComparePage() {
  const [state, setState] = useState<LoadState>({
    kind: "loading",
  });

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "demo") {
      setState({
        kind: "ready",
        session: buildMockCompareSession(),
      });
      return;
    }

    const stored = window.sessionStorage.getItem(LIVE_COMPARE_STORAGE_KEY);
    if (!stored) {
      setState({
        kind: "error",
        message:
          "실시간 비교 세션을 찾을 수 없습니다. 먼저 저장소를 연결하거나 데모 작업 공간을 여세요.",
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      setState({
        kind: "error",
        message: "저장된 비교 세션 데이터가 올바르지 않습니다. 저장소를 다시 연결하세요.",
      });
      return;
    }

    if (!isLiveCompareLaunchState(parsed)) {
      setState({
        kind: "error",
        message: "저장된 비교 세션 데이터가 불완전합니다. 저장소를 다시 연결하세요.",
      });
      return;
    }

    void loadLiveSession(parsed);
  }, []);

  async function loadLiveSession(input: {
    sessionId?: string;
    token: string;
    repoUrl: string;
    baseBranch: string;
    compareBranches: string[];
    pullRequests?: Array<{
      number: number;
      title: string;
      url: string;
      baseBranch: string;
      headBranch: string;
      headSha: string;
      isSameRepository: boolean;
      updatedAt: string;
      authorLogin: string;
    }>;
  }) {
    setState({
      kind: "loading",
    });

    try {
      const response = await fetch("/api/compare/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      const payload = (await response.json()) as CompareSessionViewModel & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "비교 세션을 만들지 못했습니다");
      }

      setState({
        kind: "ready",
        session: payload,
        connection: {
          sessionId: input.sessionId,
          token: input.token,
          repoUrl: input.repoUrl,
        },
      });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "비교 세션을 불러오지 못했습니다",
      });
    }
  }

  if (state.kind === "loading") {
    return (
      <main className="landing">
        <section className="connectPanel">
          <div className="panelHeading">
            <h1>비교 세션 불러오는 중</h1>
            <p>MoreDiff가 GitHub에서 브랜치 매트릭스를 구성하고 있습니다.</p>
          </div>
        </section>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="landing">
        <section className="connectPanel">
          <div className="panelHeading">
            <h1>비교 세션을 사용할 수 없습니다</h1>
            <p>{state.message}</p>
          </div>
          <div className="actionsRow">
            <Link href="/connect" className="primaryAction">
              저장소 연결
            </Link>
            <Link href="/compare?mode=demo" className="secondaryAction">
              데모 작업 공간 열기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const session = state.session;
  if (!session) {
    return null;
  }

  return <CompareWorkspace session={session} connection={state.connection} />;
}
