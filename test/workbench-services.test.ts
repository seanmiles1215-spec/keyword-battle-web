import { describe, expect, it, vi } from "vitest";

import type { ApiService } from "../src/lib/api";
import type { SupabaseSubmissionService, SupabaseWorkbenchService } from "../src/lib/supabase";
import { createWorkbenchPageServices } from "../src/workbench/services";

describe("workbench service idempotency", () => {
  it('task cost lookup does not depend on the published report list', async () => {
    const getTaskCostSummary = vi.fn().mockResolvedValue({ taskId: 'task' });
    const listMyReports = vi.fn().mockRejectedValue(new Error('not published'));
    const service = createWorkbenchPageServices({ api: {} as ApiService, submission: {} as SupabaseSubmissionService,
      workbench: { getTaskCostSummary, listMyReports } as unknown as SupabaseWorkbenchService, hashFile: vi.fn(), createIdempotencyKey: vi.fn() });
    await expect(service.getTaskCostSummary('task')).resolves.toEqual({ taskId: 'task' });
    expect(listMyReports).not.toHaveBeenCalled();
  });
  it("retries an ambiguous rank quote with the same client key and rotates only after a response is accepted", async () => {
    const keys = [
      "a1000000-0000-4000-8000-000000000001",
      "a1000000-0000-4000-8000-000000000002",
    ];
    const calls: Array<{ actionItemId: string; idempotencyKey: string; observationDate: string }> = [];
    const api = {
      async createRankCheckQuote(input: { actionItemId: string; idempotencyKey: string; observationDate: string }) {
        calls.push(input);
        if (calls.length === 1) throw new TypeError("response lost");
        return {
          requestId: `b1000000-0000-4000-8000-00000000000${calls.length}`,
          actionItemId: input.actionItemId,
          idempotencyKey: input.idempotencyKey,
          observationDate: input.observationDate, estimatedCredits: "1.000000",
          environmentLabel: "XYDC / US / 历史日级趋势" as const,
          quoteVersion: "rank-quote-xydc-daily-v1" as const, standardVersion: "xydc-daily-rank-v1" as const,
          requestStatus: "待确认" as const,
        };
      },
    } as ApiService;
    const services = createWorkbenchPageServices({
      api,
      submission: {} as SupabaseSubmissionService,
      workbench: {} as SupabaseWorkbenchService,
      hashFile: vi.fn(),
      createIdempotencyKey: () => keys.shift() ?? "unexpected",
    });
    const actionItemId = "71000000-0000-4000-8000-000000000001";

    await expect(services.createRankCheckQuote(actionItemId, "2026-09-20")).rejects.toThrow("response lost");
    await expect(services.createRankCheckQuote(actionItemId, "2026-09-20")).resolves.toMatchObject({ actionItemId });
    await expect(services.createRankCheckQuote(actionItemId, "2026-09-19")).resolves.toMatchObject({ actionItemId });

    expect(calls.map((call) => call.idempotencyKey)).toEqual([
      "a1000000-0000-4000-8000-000000000001",
      "a1000000-0000-4000-8000-000000000001",
      "a1000000-0000-4000-8000-000000000002",
    ]);
    expect(calls.map((call) => call.observationDate)).toEqual(["2026-09-20", "2026-09-20", "2026-09-19"]);
  });
});
