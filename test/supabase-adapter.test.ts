import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createSupabaseServices } from "../src/lib/supabase";

const SESSION_ID = "81000000-0000-0000-0000-000000000001";
const QUOTE_ID = "82000000-0000-0000-0000-000000000001";
const QUOTE_HASH = "c".repeat(64);

function fakeClient({
  uploadToSignedUrl = vi.fn().mockResolvedValue({ data: { path: "server/report.csv" }, error: null }),
  rpc = vi.fn().mockResolvedValue({ data: true, error: null }),
} = {}) {
  const from = vi.fn(() => ({ uploadToSignedUrl }));
  const client = {
    auth: {},
    storage: { from },
    rpc,
  } as unknown as SupabaseClient;
  return { client, from, uploadToSignedUrl, rpc };
}

describe("Supabase browser adapter", () => {
  it('reads only the authorized task cost RPC, never raw ledgers or admin billing', async () => {
    const harness = fakeClient();
    const { workbench } = createSupabaseServices({ supabaseUrl: 'https://project.supabase.co', publishableKey: 'synthetic', client: harness.client });
    await workbench.getTaskCostSummary(SESSION_ID);
    expect(harness.rpc).toHaveBeenCalledExactlyOnceWith('get_my_task_cost_summary_v1', { p_task_id: SESSION_ID });
    expect(harness.from).not.toHaveBeenCalled();
  });
  it("binds the one-time token to the server-issued bucket and path with upsert disabled", async () => {
    const harness = fakeClient();
    const { supabase } = createSupabaseServices({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      client: harness.client,
    });
    const file = new File(["keyword\ncarplay"], "report.csv", { type: "text/csv" });

    await supabase.uploadToSignedUrl({
      bucket: "private-inbox",
      path: "server/report.csv",
      token: "one-time-token",
      file,
      upsert: false,
    });

    expect(harness.from).toHaveBeenCalledWith("private-inbox");
    expect(harness.uploadToSignedUrl).toHaveBeenCalledWith(
      "server/report.csv",
      "one-time-token",
      file,
      { upsert: false, contentType: "text/csv" },
    );
  });

  it("maps parameter lock, atomic confirmation, and controlled cancellation to reviewed RPCs", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === "set_preflight_parameters"
        ? "a".repeat(64)
        : name === "confirm_keyword_task_v3"
          ? "61000000-0000-0000-0000-000000000001"
          : true,
      error: null,
    }));
    const harness = fakeClient({ rpc });
    const { supabase } = createSupabaseServices({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      client: harness.client,
    });

    await supabase.setPreflightParameters({
      sessionId: SESSION_ID,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-14",
      marketplace: "US",
      currency: "USD",
      reportType: "Sponsored Products Search Term",
      attributionDays: 14,
      attributionMetricGroup: "sp-sales-orders-14d",
      targetAcos: "0.30",
    });
    await supabase.confirmKeywordTask({
      sessionId: SESSION_ID,
      fileHash: "b".repeat(64),
      preflightHash: "a".repeat(64),
      idempotencyKey: "one-client-confirmation",
      asin: "B0ABC12345",
      analysisVersion: "analysis-v1",
      snapshotVersion: "snapshot-v1",
      quoteId: QUOTE_ID,
      quoteHash: QUOTE_HASH,
    });
    await supabase.cancelUploadSession(SESSION_ID);

    expect(rpc).toHaveBeenNthCalledWith(1, "set_preflight_parameters", expect.objectContaining({
      p_upload_session_id: SESSION_ID,
      p_target_acos: "0.30",
      p_attribution_metric_group: "sp-sales-orders-14d",
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "confirm_keyword_task_v3", expect.objectContaining({
      p_idempotency_key: "one-client-confirmation",
      p_quote_id: QUOTE_ID,
      p_quote_hash: QUOTE_HASH,
    }));
    expect(rpc).toHaveBeenNthCalledWith(3, "cancel_upload_session", {
      p_upload_session_id: SESSION_ID,
    });
  });

  it("classifies a thrown upload transport failure as unpaid and safely retryable", async () => {
    const harness = fakeClient({
      uploadToSignedUrl: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    });
    const { supabase } = createSupabaseServices({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      client: harness.client,
    });

    await expect(supabase.uploadToSignedUrl({
      bucket: "private-inbox",
      path: "server/report.csv",
      token: "one-time-token",
      file: new File(["keyword"], "report.csv", { type: "text/csv" }),
      upsert: false,
    })).rejects.toMatchObject({
      code: "UPLOAD_TRANSPORT_FAILURE",
      kind: "network",
      ambiguous: false,
    });
  });

  it("classifies a Supabase-returned upload fetch failure as unpaid and safely retryable", async () => {
    const harness = fakeClient({
      uploadToSignedUrl: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "", message: "TypeError: Failed to fetch" },
      }),
    });
    const { supabase } = createSupabaseServices({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      client: harness.client,
    });

    await expect(supabase.uploadToSignedUrl({
      bucket: "private-inbox",
      path: "server/report.csv",
      token: "one-time-token",
      file: new File(["keyword"], "report.csv", { type: "text/csv" }),
      upsert: false,
    })).rejects.toMatchObject({
      code: "UPLOAD_TRANSPORT_FAILURE",
      kind: "network",
      ambiguous: false,
    });
  });

  it("treats a returned SQLSTATE confirmation rejection as definitive", async () => {
    const harness = fakeClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "22023",
          message: "confirmed cost caps must exactly match preflight estimates",
        },
      }),
    });
    const { supabase } = createSupabaseServices({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      client: harness.client,
    });

    await expect(supabase.confirmKeywordTask({
      sessionId: SESSION_ID,
      fileHash: "b".repeat(64),
      preflightHash: "a".repeat(64),
      idempotencyKey: "one-client-confirmation",
      asin: "B0ABC12345",
      analysisVersion: "analysis-v1",
      snapshotVersion: "snapshot-v1",
      quoteId: QUOTE_ID,
      quoteHash: QUOTE_HASH,
    })).rejects.toMatchObject({
      code: "22023",
      kind: "validation",
      ambiguous: false,
    });
  });

  it("classifies a returned PostgreSQL transport SQLSTATE without making the outcome ambiguous", async () => {
    const harness = fakeClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "57014",
          message: "canceling statement due to statement timeout",
        },
      }),
    });
    const { supabase } = createSupabaseServices({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      client: harness.client,
    });

    await expect(supabase.confirmKeywordTask({
      sessionId: SESSION_ID,
      fileHash: "b".repeat(64),
      preflightHash: "a".repeat(64),
      idempotencyKey: "one-client-confirmation",
      asin: "B0ABC12345",
      analysisVersion: "analysis-v1",
      snapshotVersion: "snapshot-v1",
      quoteId: QUOTE_ID,
      quoteHash: QUOTE_HASH,
    })).rejects.toMatchObject({
      code: "57014",
      kind: "network",
      ambiguous: false,
    });
  });

  it("marks only a thrown confirmation transport loss as ambiguous", async () => {
    const harness = fakeClient({
      rpc: vi.fn().mockRejectedValue(new TypeError("response lost")),
    });
    const { supabase } = createSupabaseServices({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      client: harness.client,
    });

    await expect(supabase.confirmKeywordTask({
      sessionId: SESSION_ID,
      fileHash: "b".repeat(64),
      preflightHash: "a".repeat(64),
      idempotencyKey: "one-client-confirmation",
      asin: "B0ABC12345",
      analysisVersion: "analysis-v1",
      snapshotVersion: "snapshot-v1",
      quoteId: QUOTE_ID,
      quoteHash: QUOTE_HASH,
    })).rejects.toMatchObject({
      code: "CONFIRMATION_TRANSPORT_LOST",
      kind: "network",
      ambiguous: true,
    });
  });

  it("marks a Supabase-returned confirmation fetch failure as a possibly lost response", async () => {
    const harness = fakeClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "", message: "TypeError: Failed to fetch" },
      }),
    });
    const { supabase } = createSupabaseServices({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      client: harness.client,
    });

    await expect(supabase.confirmKeywordTask({
      sessionId: SESSION_ID,
      fileHash: "b".repeat(64),
      preflightHash: "a".repeat(64),
      idempotencyKey: "one-client-confirmation",
      asin: "B0ABC12345",
      analysisVersion: "analysis-v1",
      snapshotVersion: "snapshot-v1",
      quoteId: QUOTE_ID,
      quoteHash: QUOTE_HASH,
    })).rejects.toMatchObject({
      code: "CONFIRMATION_TRANSPORT_LOST",
      kind: "network",
      ambiguous: true,
    });
  });
});
