import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseServices } from "../src/lib/supabase";

const taskId = "61000000-0000-0000-0000-000000000001";
const sessionId = "81000000-0000-0000-0000-000000000001";
const quoteId = "82000000-0000-0000-0000-000000000001";
const path = `11000000-0000-0000-0000-000000000001/${taskId}.csv`;
const quoteHash = "c".repeat(64);
const input = { taskId, objectPath: path, sessionId, quoteId, quoteHash,
  fileHash: "a".repeat(64), preflightHash: "b".repeat(64),
  idempotencyKey: "same-confirmation", asin: "B0ABC12345",
  analysisVersion: "analysis-v1", snapshotVersion: "snapshot-v1" };
const row = { id: taskId, upload_session_id: sessionId, fee_quote_id: quoteId,
  fee_quote_hash: quoteHash, confirmation_idempotency_key: "same-confirmation",
  report_file_path: path, status: "新版工作台", task_status: "排队" };

function harness(insertOutcome: unknown, readOutcome: unknown = { data: null, error: null }) {
  const inserted = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => {
    if (insertOutcome instanceof Error) throw insertOutcome;
    return insertOutcome;
  }) })) }));
  const read = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => readOutcome) })) }));
  const from = vi.fn(() => ({ insert: inserted, select: read }));
  const rpc = vi.fn();
  const client = { from, rpc, auth: {}, storage: {} } as unknown as SupabaseClient;
  return { from, inserted, read, rpc, client };
}

describe("direct task insertion", () => {
  it("inserts the browser task ID and returns success only after matching row confirmation", async () => {
    const fake = harness({ data: row, error: null });
    const { supabase } = createSupabaseServices({ supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_test", client: fake.client });
    await expect(supabase.confirmKeywordTask(input)).resolves.toBe(taskId);
    expect(fake.from).toHaveBeenCalledWith("keyword_tasks");
    expect(fake.inserted).toHaveBeenCalledWith({ id: taskId, upload_session_id: sessionId,
      fee_quote_id: quoteId, fee_quote_hash: quoteHash, confirmation_idempotency_key: "same-confirmation" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("recovers a lost INSERT response only from the same visible task identity", async () => {
    const fake = harness(new TypeError("response lost"), { data: row, error: null });
    const { supabase } = createSupabaseServices({ supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_test", client: fake.client });
    await expect(supabase.confirmKeywordTask(input)).resolves.toBe(taskId);
    expect(fake.inserted).toHaveBeenCalledTimes(1);
    expect(fake.read).toHaveBeenCalledTimes(1);
  });

  it("does not declare success when readback has a different quote or object path", async () => {
    const fake = harness(new TypeError("response lost"),
      { data: { ...row, report_file_path: "foreign/report.csv" }, error: null });
    const { supabase } = createSupabaseServices({ supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_test", client: fake.client });
    await expect(supabase.confirmKeywordTask(input)).rejects.toMatchObject({
      code: "CONFIRMATION_IDENTITY_CONFLICT", kind: "validation", ambiguous: false,
    });
  });
});
