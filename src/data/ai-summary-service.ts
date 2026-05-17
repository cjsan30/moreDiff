export interface AiReviewSummaryResult {
  source: "openai" | "deterministic";
  model: string;
  summary: string;
  fallbackReason?: string;
}

interface CreateAiReviewSummaryInput {
  markdown: string;
  openAiApiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export async function createAiReviewSummary(
  input: CreateAiReviewSummaryInput,
): Promise<AiReviewSummaryResult> {
  const model =
    input.model ?? process.env.OPENAI_SUMMARY_MODEL ?? "gpt-5.4-mini";
  const openAiApiKey = input.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  if (!openAiApiKey) {
    return {
      source: "deterministic",
      model,
      summary: createDeterministicReviewSummary(input.markdown),
      fallbackReason: "OPENAI_API_KEY is not configured",
    };
  }

  try {
    const response = await (input.fetchImpl ?? fetch)(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "system",
              content:
                "You summarize multi-branch GitHub diffs for reviewers. Be concise, concrete, and risk-focused.",
            },
            {
              role: "user",
              content: `Create a review summary with sections: overall risk, overlap hotspots, branch-by-branch notes, and recommended next actions.\n\n${input.markdown.slice(0, 50000)}`,
            },
          ],
          max_output_tokens: 900,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`OpenAI summary request failed with ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const summary = extractOpenAIResponseText(payload);
    if (!summary) {
      throw new Error("OpenAI summary response did not include text");
    }

    return {
      source: "openai",
      model,
      summary,
    };
  } catch (error) {
    return {
      source: "deterministic",
      model,
      summary: createDeterministicReviewSummary(input.markdown),
      fallbackReason:
        error instanceof Error ? error.message : "OpenAI summary failed",
    };
  }
}

export function createDeterministicReviewSummary(markdown: string) {
  const lines = markdown.split("\n");
  const repository = findValueLine(lines, "Repository") ?? "unknown repository";
  const baseBranch = findValueLine(lines, "Base branch") ?? "unknown base";
  const compareBranches = findValueLine(lines, "Compare branches") ?? "none";
  const changedFiles = findValueLine(lines, "Changed files") ?? "0";
  const overlapFiles = findValueLine(lines, "Overlap files") ?? "0";
  const reviewNotes = lines.filter((line) => line.startsWith("- ["));
  const fileRows = lines.filter((line) => line.startsWith("- ") && line.includes(": "));

  return [
    `Overall risk: ${repository} compares ${compareBranches} against ${baseBranch}; ${changedFiles} changed files and ${overlapFiles} overlap files need review.`,
    `Overlap hotspots: ${fileRows.slice(0, 5).join(" | ") || "No changed file rows were exported."}`,
    `Reviewer notes: ${reviewNotes.slice(0, 5).join(" | ") || "No manual review notes were saved."}`,
    "Recommended next actions: review overlap files first, resolve saved notes, save branch-local edits, then create or update PRs from the workspace.",
  ].join("\n\n");
}

export function extractOpenAIResponseText(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  if ("output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  if (!("output" in payload) || !Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("content" in item) ||
        !Array.isArray(item.content)
      ) {
        return [];
      }

      return item.content
        .map((contentItem: unknown) =>
          typeof contentItem === "object" &&
          contentItem !== null &&
          "text" in contentItem &&
          typeof contentItem.text === "string"
            ? contentItem.text
            : "",
        )
        .filter(Boolean);
    })
    .join("\n")
    .trim();
}

function findValueLine(lines: string[], label: string) {
  const prefix = `${label}: `;
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  return line?.slice(prefix.length).trim();
}
