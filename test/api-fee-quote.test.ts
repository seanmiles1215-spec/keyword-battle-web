import { describe, expect, it, vi } from "vitest";

import { createApiService } from "../src/lib/api";

const SESSION_ID = "81000000-0000-4000-8000-000000000001";
const REQUEST_ID = "82000000-0000-4000-8000-000000000001";

const readyQuote = {
  state: "ready",
  quoteId: "83000000-0000-4000-8000-000000000001",
  quoteHash: "d".repeat(64),
  feeProtocolVersion: "provider-fees-v2",
  expiresAt: "2030-09-23T00:00:00.000Z",
  current: true,
  providers: [
    { provider: "豆包", currencyOrUnit: "CNY", estimatedCost: "1.250000", lockedCap: "1.250000" },
    { provider: "西柚", currencyOrUnit: "credits", estimatedCost: "72.000000", lockedCap: "72.000000" },
  ],
} as const;

const responseV2 = {
  responseSchemaVersion: "preflight-fee-dialog-v2",
  asin: "B0ABC12345",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-14",
  periodDays: 14,
  marketplace: "US",
  currency: "USD",
  reportType: "Sponsored Products Search Term Report",
  attributionDaysCandidates: [14],
  attributionMetricGroups: [{ id: "sp-14", worksheets: ["Sponsored Products Search Term"], days: 14,
    fieldGroup: "14 Day Total Sales and Orders", occurrence: 1, headers: ["14 Day Total Sales"], metrics: ["sales"] }],
  estimatedKeywordCount: 36,
  calculationBasis: { keywordCount: 36, parserVersion: "preflight-2" },
  manualExecutionScopeRequired: false,
  preflightStatus: "可确认",
  preflightBlockers: [],
  preflightWarnings: [],
  feeQuote: readyQuote,
} as const;

function makeApi(fetchImpl: typeof fetch) {
  return createApiService({
    apiBaseUrl: "https://api.example.test",
    getAccessToken: vi.fn().mockResolvedValue("synthetic-access-token"),
    fetchImpl,
  });
}

describe("provider fee quote API boundary", () => {
  it("accepts paired declaration provenance but rejects an unpaired marker", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      ...responseV2, asinSource: "user_declared", marketplaceSource: "report",
    }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({
      ...responseV2, asinSource: "user_declared",
    }), { status: 200 }));
    const api = makeApi(fetchImpl);
    await expect(api.refreshFeeQuote({ sessionId: SESSION_ID, requestId: REQUEST_ID }))
      .resolves.toMatchObject({ asinSource: "user_declared", marketplaceSource: "report" });
    await expect(api.refreshFeeQuote({ sessionId: SESSION_ID, requestId: REQUEST_ID }))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
  });
  it("refreshes the full flat v2 preflight response using only a request UUID", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseV2), { status: 200 }));
    const api = makeApi(fetchImpl);

    const response = await api.refreshFeeQuote({ sessionId: SESSION_ID, requestId: REQUEST_ID });

    expect(response).toMatchObject({ responseSchemaVersion: "preflight-fee-dialog-v2", feeQuote: readyQuote });
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      `https://api.example.test/v1/fee-quotes/${SESSION_ID}`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ requestId: REQUEST_ID }),
        headers: expect.objectContaining({
          authorization: "Bearer synthetic-access-token",
          "content-type": "application/json",
        }),
      }),
    );
  });

  it("rejects internal pricing fields as an ambiguous invalid response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...responseV2,
      pricingManifest: { providerAccountRef: "internal-only" },
    }), { status: 200 }));
    const api = makeApi(fetchImpl);

    await expect(api.refreshFeeQuote({ sessionId: SESSION_ID, requestId: REQUEST_ID }))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE", kind: "network", ambiguous: true });
  });

  it("rejects a calendar-impossible date instead of normalizing it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...responseV2,
      periodStart: "2026-02-31",
    }), { status: 200 }));
    const api = makeApi(fetchImpl);

    await expect(api.refreshFeeQuote({ sessionId: SESSION_ID, requestId: REQUEST_ID }))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE", ambiguous: true });
  });

  it("preserves one request identifier after a server reports an unknown quote outcome", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "FEE_QUOTE_OUTCOME_UNKNOWN" },
    }), { status: 503 }));
    const api = makeApi(fetchImpl);

    await expect(api.refreshFeeQuote({ sessionId: SESSION_ID, requestId: REQUEST_ID }))
      .rejects.toMatchObject({ code: "FEE_QUOTE_OUTCOME_UNKNOWN", kind: "network", ambiguous: true });
  });
});
