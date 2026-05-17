export type DiffLineKind = "hunk" | "context" | "add" | "delete";

export interface SplitDiffLine {
  kind: DiffLineKind;
  left: string;
  right: string;
}

export function parseUnifiedPatchForSplitView(patch: string): SplitDiffLine[] {
  return patch.split(/\r?\n/).map((line) => {
    if (line.startsWith("@@")) {
      return {
        kind: "hunk",
        left: line,
        right: line,
      };
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      return {
        kind: "add",
        left: "",
        right: line.slice(1),
      };
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      return {
        kind: "delete",
        left: line.slice(1),
        right: "",
      };
    }

    const content = line.startsWith(" ") ? line.slice(1) : line;
    return {
      kind: "context",
      left: content,
      right: content,
    };
  });
}
