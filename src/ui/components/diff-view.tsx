"use client";

import { parseUnifiedPatchForSplitView } from "@/src/ui/components/diff-lines";

export type DiffViewMode = "unified" | "split";

interface DiffViewProps {
  patch: string;
  mode: DiffViewMode;
}

export function DiffView({ patch, mode }: DiffViewProps) {
  if (mode === "unified") {
    return <pre className="patchBlock">{patch}</pre>;
  }

  const rows = parseUnifiedPatchForSplitView(patch);
  return (
    <div className="splitDiffTable" role="table" aria-label="Split diff view">
      <div className="splitDiffHeader" role="row">
        <span role="columnheader">Base side</span>
        <span role="columnheader">Compare side</span>
      </div>
      {rows.map((row, index) => (
        <div
          className={`splitDiffRow ${row.kind}`}
          key={`${index}:${row.kind}:${row.left}:${row.right}`}
          role="row"
        >
          <code role="cell">{row.left}</code>
          <code role="cell">{row.right}</code>
        </div>
      ))}
    </div>
  );
}
