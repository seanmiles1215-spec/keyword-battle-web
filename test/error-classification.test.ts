import { describe, expect, it, vi } from "vitest";

import {
  createApiService,
  humanizeSubmissionError,
  SubmissionError,
} from "../src/lib/api";

function apiWithResponse(status: number, code: string) {
  return createApiService({
    apiBaseUrl: "https://api.example.test",
    getAccessToken: vi.fn().mockResolvedValue("current-session-token"),
    fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code, message: "controlled response" },
    }), {
      status,
      headers: { "content-type": "application/json" },
    })),
  });
}

describe("submission error classification", () => {
  it("classifies an expired upload session separately from a transport failure", async () => {
    const api = apiWithResponse(409, "UPLOAD_SESSION_EXPIRED");

    await expect(api.runPreflight("81000000-0000-0000-0000-000000000001"))
      .rejects.toMatchObject({
        code: "UPLOAD_SESSION_EXPIRED",
        kind: "expired",
        ambiguous: false,
      });
    expect(humanizeSubmissionError(
      new SubmissionError("UPLOAD_SESSION_EXPIRED", "expired"),
    )).toMatch(/已到期/u);
  });

  it("classifies a controlled Preflight blocker as parameters-needed", async () => {
    const api = apiWithResponse(422, "PREFLIGHT_BLOCKED");

    await expect(api.runPreflight("81000000-0000-0000-0000-000000000001"))
      .rejects.toMatchObject({
        code: "PREFLIGHT_BLOCKED",
        kind: "needs_parameters",
        ambiguous: false,
      });
    expect(humanizeSubmissionError(
      new SubmissionError("PREFLIGHT_BLOCKED", "needs_parameters"),
    )).toMatch(/补齐分析口径/u);
  });

  it.each([
    ["REVIEW_ASIN_MISSING", "复盘文件缺少合法 ASIN。"],
    ["REVIEW_ASIN_MISMATCH", "复盘文件 ASIN 与动作报告不一致。"],
    ["REVIEW_EXECUTION_OBJECT_MISMATCH", "复盘文件不包含已确认的执行对象。"],
    ["REVIEW_WINDOW_MISMATCH", "复盘文件周期与执行前后窗口不一致。"],
  ])("renders the safe review blocker for %s", (code, message) => {
    expect(humanizeSubmissionError(new SubmissionError(code, "validation"))).toBe(message);
  });
});
