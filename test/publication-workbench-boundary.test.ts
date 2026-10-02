import { describe, expect, it } from "vitest";

import { normalizeWorkbenchPayload } from "../src/workbench/contract";
import { workbenchPayload } from "./workbench-fixtures";

// Keep this contract fixture local to the frontend repository. The source
// monorepo retains the integration test against the real Worker DTO builder.
const publicationFixture = {
  actionTargets: [{
    executionScope: {
      campaign_id: "campaign-a",
      campaign_name: "Campaign A",
      ad_group_id: "ad-group-a",
      ad_group_name: "Ad Group A",
      target_id: "target-a",
      target_type: "keyword",
      match_type: "EXACT",
      search_term: "wireless carplay adapter",
    },
  }],
  evidenceRows: [{
    competitorDetails: [{
      schema_version: "competitor-detail-v1",
      asin: "B0COMP0001",
      click_share: "0.24000000",
      note: "点击份额第一",
    }],
  }],
};

describe("publication-shaped SQL workbench boundary", () => {
  it("normalizes a SQL-shaped execution scope and versioned competitor details", () => {
    const payload = workbenchPayload();
    payload.actions[0].execution_scope = publicationFixture.actionTargets[0].executionScope;
    payload.actions[0].competitor_details = structuredClone(publicationFixture.evidenceRows[0].competitorDetails);

    const result = normalizeWorkbenchPayload(payload);

    expect(result.contractComplete).toBe(true);
    expect(result.actions[0].executionScope).toEqual(publicationFixture.actionTargets[0].executionScope);
    expect(result.actions[0].competitorDetails).toEqual([{
      asin: "B0COMP0001", clickShare: "0.24000000", note: "点击份额第一",
    }]);
  });

  it("remains fail-closed for unknown scope keys and competitor versions", () => {
    const payload = workbenchPayload();
    payload.actions[0].execution_scope = {
      ...publicationFixture.actionTargets[0].executionScope,
      browser_override: "forbidden",
    };
    payload.actions[0].competitor_details = structuredClone(publicationFixture.evidenceRows[0].competitorDetails);
    expect(normalizeWorkbenchPayload(payload).contractComplete).toBe(false);

    delete (payload.actions[0].execution_scope as Record<string, unknown>).browser_override;
    (payload.actions[0].competitor_details as Array<Record<string, unknown>>)[0].schema_version = "competitor-detail-v999";
    expect(normalizeWorkbenchPayload(payload).contractComplete).toBe(false);

    payload.actions[0].competitor_details = structuredClone(publicationFixture.evidenceRows[0].competitorDetails);
    payload.actions[0].execution_scope = null;
    expect(normalizeWorkbenchPayload(payload).contractComplete).toBe(false);
  });
});
