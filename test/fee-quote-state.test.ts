import { describe, expect, it } from "vitest";

import {
  acceptsFeeResponse,
  feeRequestKey,
  getConfirmableFeeQuote,
  isFeeQuoteExpired,
  isCurrentFeeQuoteRequest,
  normalizeFeeQuote,
  type FeeQuoteUiState,
  type FeeQuoteRequestKey,
} from "../src/new-report/fee-quote-state";

const readyQuote = {
  state: "ready",
  quoteId: "55000000-0000-4000-8000-000000000001",
  quoteHash: "c".repeat(64),
  feeProtocolVersion: "provider-fees-v2",
  expiresAt: "2026-09-24T00:00:00.000Z",
  current: true,
  providers: [
    { provider: "豆包", currencyOrUnit: "CNY", estimatedCost: "0.006000", lockedCap: "0.006000" },
    { provider: "西柚", currencyOrUnit: "credits", estimatedCost: "72.000000", lockedCap: "72.000000" },
  ],
} as const;

describe("provider fee quote UI boundary", () => {
  it("accepts only a complete CNY-plus-credits ready quote", () => {
    expect(normalizeFeeQuote(readyQuote)).toEqual(readyQuote);
    expect(normalizeFeeQuote({ state: "unavailable", reasonCode: "PRICING_UNAVAILABLE" }))
      .toEqual({ state: "unavailable", reasonCode: "PRICING_UNAVAILABLE" });
  });

  it("rejects unsafe provider order, currency, cap, hash, and private fields", () => {
    const unsafeShapes: unknown[] = [
      { ...readyQuote, providers: [readyQuote.providers[1], readyQuote.providers[0]] },
      { ...readyQuote, providers: [{ ...readyQuote.providers[0], currencyOrUnit: "USD" }, readyQuote.providers[1]] },
      { ...readyQuote, providers: [{ ...readyQuote.providers[0], lockedCap: "0.005999" }, readyQuote.providers[1]] },
      { ...readyQuote, quoteHash: "not-a-hash" },
      { ...readyQuote, privatePricing: { apiKey: "must-not-pass" } },
    ];
    for (const value of unsafeShapes) expect(() => normalizeFeeQuote(value)).toThrow();
  });

  it("treats the exact expiry instant as expired", () => {
    const quote = normalizeFeeQuote(readyQuote);
    expect(quote.state).toBe("ready");
    if (quote.state === "ready") {
      expect(isFeeQuoteExpired(quote, Date.parse("2026-09-23T23:59:59.999Z"))).toBe(false);
      expect(isFeeQuoteExpired(quote, Date.parse("2026-09-24T00:00:00.000Z"))).toBe(true);
    }
  });

  it("accepts a delayed response only for the same user, workspace, session, revision, and request", () => {
    const request: FeeQuoteRequestKey = {
      userId: "user-a", workspaceId: "workspace-a", sessionId: "session-a", parameterRevision: 3,
      requestId: "request-a",
    };
    expect(isCurrentFeeQuoteRequest(request, { ...request })).toBe(true);
    for (const changed of [
      { userId: "user-b" }, { workspaceId: "workspace-b" }, { sessionId: "session-b" },
      { parameterRevision: 4 }, { requestId: "request-b" },
    ]) {
      expect(isCurrentFeeQuoteRequest(request, { ...request, ...changed })).toBe(false);
    }
  });

  it("serializes request identity in a stable tuple and rejects every stale identity", () => {
    const request: FeeQuoteRequestKey = {
      userId: "user-a", workspaceId: "workspace-a", sessionId: "session-a", parameterRevision: 3,
      requestId: "request-a",
    };
    const key = feeRequestKey(request);

    expect(key).toBe(JSON.stringify(["user-a", "workspace-a", "session-a", 3, "request-a"]));
    expect(acceptsFeeResponse(key, feeRequestKey(request))).toBe(true);
    for (const changed of [
      { userId: "user-b" }, { workspaceId: "workspace-b" }, { sessionId: "session-b" },
      { parameterRevision: 4 }, { requestId: "request-b" },
    ]) {
      expect(acceptsFeeResponse(key, feeRequestKey({ ...request, ...changed }))).toBe(false);
    }
  });

  it("permits an expired or superseded quote only for an exact ambiguous confirmation replay", () => {
    const request: FeeQuoteRequestKey = {
      userId: "user-a", workspaceId: "workspace-a", sessionId: "session-a", parameterRevision: 3,
      requestId: "request-a",
    };
    const expiredQuote = normalizeFeeQuote({ ...readyQuote, expiresAt: "2020-01-01T00:00:00.000Z" });
    if (expiredQuote.state !== "ready") throw new Error("fixture must be ready");
    const expiredState: FeeQuoteUiState = { status: "expired", request, quote: expiredQuote };
    const supersededQuote = normalizeFeeQuote({ ...readyQuote, current: false });
    if (supersededQuote.state !== "ready") throw new Error("fixture must be ready");
    const supersededState: FeeQuoteUiState = { status: "ready", request, quote: supersededQuote };

    expect(getConfirmableFeeQuote(expiredState)).toBeNull();
    expect(getConfirmableFeeQuote(expiredState, true)).toEqual(expiredQuote);
    expect(getConfirmableFeeQuote(supersededState)).toBeNull();
    expect(getConfirmableFeeQuote(supersededState, true)).toEqual(supersededQuote);
  });
});
