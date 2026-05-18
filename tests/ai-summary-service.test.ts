import { describe, expect, it, vi } from "vitest";

import {
  createAiReviewSummary,
  extractOpenAIResponseText,
} from "@/src/data/ai-summary-service";

const MARKDOWN = `# MoreDiff 리뷰 요약

저장소: octo/repo
기준 브랜치: main
비교 브랜치: feature/a, feature/b
변경 파일: 2
겹침 파일: 1

## 파일 매트릭스

- src/app.ts: feature/a modified (+1/-1); feature/b modified (+2/-0)

## 리뷰 노트

- [열림] src/app.ts (feature/a): 병합 전에 겹침을 확인하세요
`;

describe("AI review summary service", () => {
  it("uses deterministic fallback when no OpenAI API key is configured", async () => {
    const fetchMock = vi.fn();
    await expect(
      createAiReviewSummary({
        markdown: MARKDOWN,
        openAiApiKey: "",
        model: "gpt-5.4-mini",
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      source: "deterministic",
      model: "gpt-5.4-mini",
      fallbackReason: "OPENAI_API_KEY가 설정되지 않았습니다",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("extracts output text from Responses API payloads", () => {
    expect(
      extractOpenAIResponseText({
        output: [
          {
            content: [
              {
                text: "review summary",
              },
            ],
          },
        ],
      }),
    ).toBe("review summary");
  });

  it("calls the Responses API when an OpenAI API key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        output_text: "AI review summary",
      }),
    );

    await expect(
      createAiReviewSummary({
        markdown: MARKDOWN,
        openAiApiKey: "sk-test",
        model: "gpt-5.4-mini",
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toEqual({
      source: "openai",
      model: "gpt-5.4-mini",
      summary: "AI review summary",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("falls back without leaking the OpenAI API key when the API fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            message: "잘못된 키",
          },
        },
        {
          status: 401,
        },
      ),
    );
    const secret = "sk-test-secret-that-must-not-appear";

    const result = await createAiReviewSummary({
      markdown: MARKDOWN,
      openAiApiKey: secret,
      model: "gpt-5",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      source: "deterministic",
      model: "gpt-5",
      fallbackReason: "OpenAI 요약 요청이 401 상태로 실패했습니다",
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("caps the diff markdown sent to OpenAI for large sessions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        output_text: "AI review summary",
      }),
    );
    const largeMarkdown = `${MARKDOWN}\n${"x".repeat(80_000)}`;

    await createAiReviewSummary({
      markdown: largeMarkdown,
      openAiApiKey: "sk-test",
      model: "gpt-5",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    ) as {
      input: Array<{
        role: string;
        content: string;
      }>;
    };
    const userMessage = body.input.find((message) => message.role === "user");

    expect(userMessage?.content.length).toBeLessThan(51_000);
  });
});
