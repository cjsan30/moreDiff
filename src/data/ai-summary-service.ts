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
    input.model ?? process.env.OPENAI_SUMMARY_MODEL ?? "gpt-5";
  const openAiApiKey = input.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  if (!openAiApiKey) {
    return {
      source: "deterministic",
      model,
      summary: createDeterministicReviewSummary(input.markdown),
      fallbackReason: "OPENAI_API_KEY가 설정되지 않았습니다",
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
                "여러 GitHub 브랜치의 diff를 리뷰어 관점에서 한국어로 요약합니다. 간결하고 구체적으로, 위험 요소 중심으로 작성하세요.",
            },
            {
              role: "user",
              content: `다음 섹션을 포함한 한국어 리뷰 요약을 작성하세요: 전체 위험도, 겹침 주요 지점, 브랜치별 메모, 권장 다음 작업.\n\n${input.markdown.slice(0, 50000)}`,
            },
          ],
          max_output_tokens: 900,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`OpenAI 요약 요청이 ${response.status} 상태로 실패했습니다`);
    }

    const payload = (await response.json()) as unknown;
    const summary = extractOpenAIResponseText(payload);
    if (!summary) {
      throw new Error("OpenAI 요약 응답에 텍스트가 없습니다");
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
        error instanceof Error ? error.message : "OpenAI 요약에 실패했습니다",
    };
  }
}

export function createDeterministicReviewSummary(markdown: string) {
  const lines = markdown.split("\n");
  const repository = findValueLine(lines, "저장소") ?? "알 수 없는 저장소";
  const baseBranch = findValueLine(lines, "기준 브랜치") ?? "알 수 없는 기준";
  const compareBranches = findValueLine(lines, "비교 브랜치") ?? "없음";
  const changedFiles = findValueLine(lines, "변경 파일") ?? "0";
  const overlapFiles = findValueLine(lines, "겹침 파일") ?? "0";
  const reviewNotes = lines.filter((line) => line.startsWith("- ["));
  const fileRows = lines.filter((line) => line.startsWith("- ") && line.includes(": "));

  return [
    `전체 위험도: ${repository} 저장소에서 ${compareBranches} 브랜치를 ${baseBranch} 기준으로 비교합니다. 변경 파일 ${changedFiles}개와 겹침 파일 ${overlapFiles}개를 검토해야 합니다.`,
    `겹침 주요 지점: ${fileRows.slice(0, 5).join(" | ") || "내보낸 변경 파일 행이 없습니다."}`,
    `리뷰어 노트: ${reviewNotes.slice(0, 5).join(" | ") || "저장된 수동 리뷰 노트가 없습니다."}`,
    "권장 다음 작업: 겹침 파일을 먼저 검토하고, 저장된 노트를 해결한 뒤, 브랜치별 편집을 저장하고 작업 공간에서 PR을 생성하거나 업데이트하세요.",
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
