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
          "No live compare session was found. Connect a repository first or open the demo workspace.",
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      setState({
        kind: "error",
        message: "Stored compare session data is invalid. Reconnect the repository.",
      });
      return;
    }

    if (!isLiveCompareLaunchState(parsed)) {
      setState({
        kind: "error",
        message: "Stored compare session data is incomplete. Reconnect the repository.",
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
        throw new Error(payload.error ?? "failed to build compare session");
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
          error instanceof Error ? error.message : "failed to load compare session",
      });
    }
  }

  if (state.kind === "loading") {
    return (
      <main className="landing">
        <section className="connectPanel">
          <div className="panelHeading">
            <h1>Loading compare session</h1>
            <p>MoreDiff is building the branch matrix from GitHub.</p>
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
            <h1>Compare session unavailable</h1>
            <p>{state.message}</p>
          </div>
          <div className="actionsRow">
            <Link href="/connect" className="primaryAction">
              Connect repository
            </Link>
            <Link href="/compare?mode=demo" className="secondaryAction">
              Open demo workspace
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
