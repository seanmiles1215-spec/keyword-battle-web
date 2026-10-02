import type { SupabaseClient } from "@supabase/supabase-js";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createSupabaseServices } from "../src/lib/supabase";
import { createApiService } from "../src/lib/api";
import { ExecutionDialog } from "../src/workbench/ExecutionDialog";
import { WorkbenchView } from "../src/workbench/WorkbenchPage";
import { normalizeWorkbenchPayload } from "../src/workbench/contract";
import { actionPermissions } from "../src/workbench/types";
import { CREATOR_ID, OWNER_ID, workbenchPayload } from "./workbench-fixtures";

function operations() {
  return {
    assignOwner: vi.fn(),
    confirmScope: vi.fn(),
    execute: vi.fn(),
    submitReview: vi.fn(),
    requestCancel: vi.fn(),
    confirmCancel: vi.fn(),
    close: vi.fn(),
    preflightReviewDataset: vi.fn(),
    downloadSnapshot: vi.fn(),
    quoteRankCheck: vi.fn(),
    confirmRankCheck: vi.fn(),
  };
}

describe("workbench action permissions and boundaries", () => {
  it("lets an assigned owner execute, upload/submit review and request cancellation, but never assign or close", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload();
    raw.actions[0].action_status = "待复盘";
    const data = normalizeWorkbenchPayload(raw);
    render(<WorkbenchView data={data} viewerUserId={OWNER_ID} operations={operations()} />);

    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    const drawer = screen.getByRole("dialog", { name: "动作证据详情" });
    expect(within(drawer).getByRole("button", { name: "上传复盘报表" })).toBeEnabled();
    expect(within(drawer).getByRole("button", { name: "提交复盘" })).toBeEnabled();
    expect(within(drawer).getByRole("button", { name: "申请取消" })).toBeEnabled();
    expect(within(drawer).queryByRole("button", { name: "分配 Owner" })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "关闭动作" })).not.toBeInTheDocument();
  });

  it("keeps terminal review history visible without upload, submission, or cancellation", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload();
    raw.actions[0].action_status = "已复盘";
    raw.actions[0].review = { ...(raw.actions[0].review as Record<string, unknown>), review_status: "已提交" };
    render(<WorkbenchView data={normalizeWorkbenchPayload(raw)} viewerUserId={OWNER_ID} operations={operations()} />);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    const drawer = screen.getByRole("dialog", { name: "动作证据详情" });
    expect(within(drawer).queryByRole("button", { name: "上传复盘报表" })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "提交复盘" })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "申请取消" })).not.toBeInTheDocument();
  });

  it("lets the creator assign, confirm cancellation, and close only eligible active actions", async () => {
    const user = userEvent.setup();
    const pending = normalizeWorkbenchPayload(workbenchPayload());
    const { unmount } = render(<WorkbenchView data={pending} viewerUserId={CREATOR_ID} operations={operations()} />);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    expect(screen.getByRole("button", { name: "分配 Owner" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "关闭动作" })).not.toBeInTheDocument();
    unmount();

    const raw = workbenchPayload();
    raw.actions[0].action_status = "已复盘";
    raw.actions[0].review = {
      ...(raw.actions[0].review as Record<string, unknown>),
      review_status: "已提交",
    };
    const data = normalizeWorkbenchPayload(raw);
    render(<WorkbenchView data={data} viewerUserId={CREATOR_ID} operations={operations()} />);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    const drawer = screen.getByRole("dialog", { name: "动作证据详情" });
    expect(within(drawer).queryByRole("button", { name: "分配 Owner" })).not.toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "关闭动作" })).toBeEnabled();
    expect(within(drawer).queryByRole("button", { name: "标记已执行" })).not.toBeInTheDocument();
  });

  it("shows cancellation confirmation only to the creator while the action is pending confirmation", async () => {
    const user = userEvent.setup();
    const confirmCancel = vi.fn();
    const ops = { ...operations(), confirmCancel };
    const raw = workbenchPayload();
    raw.actions[0].action_status = "取消待确认";
    const data = normalizeWorkbenchPayload(raw);
    render(<WorkbenchView data={data} viewerUserId={CREATOR_ID} operations={ops} />);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    const drawer = screen.getByRole("dialog", { name: "动作证据详情" });
    expect(within(drawer).queryByRole("button", { name: "关闭动作" })).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "确认取消" }));
    expect(confirmCancel).toHaveBeenCalledWith(data.actions[0]);
  });

  it("makes a superseded report entirely read-only even for its creator and owner", async () => {
    const user = userEvent.setup();
    const data = normalizeWorkbenchPayload(workbenchPayload({
      report: { is_active_version: false, report_status: "已替代" },
    }));
    render(<WorkbenchView data={data} viewerUserId={CREATOR_ID} operations={operations()} />);
    expect(screen.getByRole("status")).toHaveTextContent("已替代版本只读");
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    const drawer = screen.getByRole("dialog", { name: "动作证据详情" });
    expect(within(drawer).queryByRole("button", { name: "分配 Owner" })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "标记已执行" })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "提交复盘" })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "关闭动作" })).not.toBeInTheDocument();
  });

  it("disables execution for manual scope until the controlled confirmation succeeds", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload();
    raw.actions[0].execution_scope_status = "手工执行范围待确认";
    raw.actions[0].execution_scope = {};
    raw.actions[0].operable = false;
    const data = normalizeWorkbenchPayload(raw);
    render(<WorkbenchView data={data} viewerUserId={OWNER_ID} operations={operations()} />);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    const drawer = screen.getByRole("dialog", { name: "动作证据详情" });
    expect(within(drawer).getByRole("button", { name: "标记已执行" })).toBeDisabled();
    expect(within(drawer).getByRole("button", { name: "确认手工作用域" })).toBeEnabled();
  });

  it("submits every explicit manual execution locator through the controlled scope operation", async () => {
    const user = userEvent.setup();
    const confirmScope = vi.fn();
    const raw = workbenchPayload();
    raw.actions[0].execution_scope_status = "手工执行范围待确认";
    raw.actions[0].execution_scope = {};
    raw.actions[0].operable = false;
    const data = normalizeWorkbenchPayload(raw);
    render(<WorkbenchView data={data} viewerUserId={OWNER_ID} operations={{ ...operations(), confirmScope }} />);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    await user.click(screen.getByRole("button", { name: "确认手工作用域" }));
    for (const [label, value] of [
      ["Campaign ID", "campaign-manual"],
      ["Ad Group ID", "ad-group-manual"],
      ["Target ID", "target-manual"],
      ["Target Type", "keyword"],
      ["Source Locator", "manual-sheet:A42"],
    ]) await user.type(screen.getByLabelText(label), value);
    expect(screen.getByRole("button", { name: "提交作用域确认" })).toBeDisabled();
    for (const [label, value] of [
      ["Match Type", "PHRASE"],
      ["Search Term", "wireless carplay adapter"],
      ["Target Expression", "wireless carplay adapter"],
    ]) await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: "提交作用域确认" }));
    expect(confirmScope).toHaveBeenCalledWith(data.actions[0], {
      campaignId: "campaign-manual",
      adGroupId: "ad-group-manual",
      targetId: "target-manual",
      targetType: "keyword",
      matchType: "PHRASE",
      searchTerm: "wireless carplay adapter",
      targetExpression: "wireless carplay adapter",
      sourceLocator: "manual-sheet:A42",
    });
  });

  it("refreshes an open action detail from the latest controlled response after a mutation", async () => {
    const user = userEvent.setup();
    const active = normalizeWorkbenchPayload(workbenchPayload());
    const { rerender } = render(<WorkbenchView data={active} viewerUserId={OWNER_ID} operations={operations()} />);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    expect(screen.getByRole("button", { name: "标记已执行" })).toBeEnabled();

    const refreshedRaw = workbenchPayload();
    refreshedRaw.actions[0].action_status = "观察中";
    refreshedRaw.actions[0].executed_at = "2026-08-27T09:30:00.000Z";
    const refreshed = normalizeWorkbenchPayload(refreshedRaw);
    rerender(<WorkbenchView data={refreshed} viewerUserId={OWNER_ID} operations={operations()} />);
    expect(screen.queryByRole("button", { name: "标记已执行" })).not.toBeInTheDocument();
    expect(screen.getByText("2026-08-27T09:30:00.000Z")).toBeVisible();
  });

  it.each([
    ["actual_bid", "实际出价", "2.75", { actualBid: "2.75", actualBudget: null, actualNegativeAction: null }],
    ["actual_budget", "实际预算", "20", { actualBid: null, actualBudget: "20", actualNegativeAction: null }],
    ["actual_negative_action", "实际否定动作", "否定精准 carplay box", { actualBid: null, actualBudget: null, actualNegativeAction: "否定精准 carplay box" }],
  ] as const)("validates and submits only the %s execution field", async (requirement, label, value, expected) => {
    const user = userEvent.setup();
    const execute = vi.fn();
    const raw = workbenchPayload();
    raw.actions[0].execution_requirement = requirement;
    const action = normalizeWorkbenchPayload(raw).actions[0];
    render(<ExecutionDialog action={action} onCancel={vi.fn()} onExecute={execute} />);
    expect(screen.getByRole("button", { name: "确认执行" })).toBeDisabled();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: "确认执行" }));
    expect(execute).toHaveBeenCalledWith(expected);
  });

  it("rejects zero, over-precision, and numeric(18,6) overflow actual amounts before the RPC", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload();
    raw.actions[0].execution_requirement = "actual_bid";
    render(<ExecutionDialog action={normalizeWorkbenchPayload(raw).actions[0]} onCancel={vi.fn()} onExecute={vi.fn()} />);
    const field = screen.getByLabelText("实际出价");
    const submit = screen.getByRole("button", { name: "确认执行" });
    for (const invalid of ["0", "0.000000", "1.0000001", "1000000000000"]) {
      await user.clear(field);
      await user.type(field, invalid);
      expect(submit).toBeDisabled();
    }
  });

  it("fails closed when the richer allowlisted contract is incomplete or contains forbidden internals", () => {
    const raw = workbenchPayload() as Record<string, unknown>;
    const report = raw.report as Record<string, unknown>;
    delete report.report_blocker;
    report.snapshot_object_key = "private-report-key";
    report.source_file_hash = "a".repeat(64);
    report.checkpoint = { provider: "secret" };
    const action = (raw.actions as Array<Record<string, unknown>>)[0];
    action.operation_key = "paid-operation-secret";
    action.object_path = "private/source.csv";

    const data = normalizeWorkbenchPayload(raw);
    expect(data.contractComplete).toBe(false);
    expect(data.report.reportBlocker).toBe("待补口径");
    expect(data.actions[0]).not.toHaveProperty("operationKey");
    render(<WorkbenchView data={data} viewerUserId={CREATOR_ID} operations={operations()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("待补口径");
    expect(document.body).not.toHaveTextContent("private-report-key");
    expect(document.body).not.toHaveTextContent("paid-operation-secret");
    expect(screen.queryByRole("button", { name: "标记已执行" })).not.toBeInTheDocument();
  });

  it("keeps legacy ambiguous execution requirements readable but blocked for manual confirmation", () => {
    const raw = workbenchPayload();
    raw.actions = [structuredClone(raw.actions[0])];
    raw.actions[0].execution_requirement = "none";
    raw.actions[0].action_blocker = "执行要求待确认";
    raw.actions[0].operable = false;

    const data = normalizeWorkbenchPayload(raw);
    expect(data.contractComplete).toBe(true);
    expect(data.actions[0].executionRequirement).toBe("none");
    expect(data.actions[0].actionBlocker).toBe("执行要求待确认");
    expect(data.actions[0].operable).toBe(false);
    expect(actionPermissions(data, data.actions[0], OWNER_ID).canExecute).toBe(false);
  });

  it("fails closed on unsupported report dimensions, invalid decimals, or an unknown action category", () => {
    const raw = workbenchPayload();
    raw.report.marketplace = "CA";
    raw.actions[0].planned_up_amount = "not-a-decimal";
    raw.actions[0].action_category = "自动扩量";
    const data = normalizeWorkbenchPayload(raw);
    expect(data.contractComplete).toBe(false);
    expect(data.report.reportBlocker).toBe("待补口径");
    expect(data.actions[0].actionCategory).toBeNull();
  });

  it("fails closed when nested review/member/type fields needed by the UI are incomplete", () => {
    const missingReviewField = workbenchPayload();
    delete (missingReviewField.actions[0].review as Record<string, unknown>).comparable;
    expect(normalizeWorkbenchPayload(missingReviewField).contractComplete).toBe(false);

    const missingValidationPeriod = workbenchPayload();
    delete (missingValidationPeriod.report as Record<string, unknown>).test_validation_days;
    expect(normalizeWorkbenchPayload(missingValidationPeriod).contractComplete).toBe(false);

    const malformedMember = workbenchPayload();
    malformedMember.report.workspace_members = [{ user_id: "", display_name: "无账号成员" }];
    expect(normalizeWorkbenchPayload(malformedMember).contractComplete).toBe(false);

    const malformedSampleFlag = workbenchPayload();
    (malformedSampleFlag.actions[0] as Record<string, unknown>).sample_sufficient = "yes";
    expect(normalizeWorkbenchPayload(malformedSampleFlag).contractComplete).toBe(false);
  });

  it("fails closed on malformed UUID/date/time/context/enums and nested rank or review identities", () => {
    const mutations: Array<(raw: ReturnType<typeof workbenchPayload>) => void> = [
      (raw) => { raw.report.report_id = "not-a-uuid"; },
      (raw) => { raw.report.target_acos = "1.00000001"; },
      (raw) => { raw.report.attribution_days = 0; },
      (raw) => { raw.report.report_type = "Sponsored Products Search Term"; },
      (raw) => { raw.report.published_at = "yesterday"; },
      (raw) => { raw.actions[0].planned_execution_date = "2026-02-30"; },
      (raw) => { raw.actions[0].execution_scope_status = "自动定位"; },
      (raw) => { (raw.actions[0].review as Record<string, unknown>).before_dataset_id = "dataset-1"; },
      (raw) => { raw.actions[0].rank_checks = [{ request_status: "成功", checked_at: "bad-time", natural_rank: 2, environment_label: "US / 90001 / 无痕桌面端", post_execution: false }]; },
      (raw) => { raw.actions[0].rank_checks = [{ request_status: "成功", checked_at: "2026-08-27T08:00:00.000Z", natural_rank: 0, environment_label: "US / 90001 / 无痕桌面端", post_execution: false }]; },
      (raw) => {
        raw.actions[0].executed_at = "2026-08-26T08:00:00.000Z";
        raw.actions[0].rank_checks = [{ request_status: "成功", checked_at: "2026-08-27T08:00:00.000Z", natural_rank: 12, environment_label: "US / 90001 / 无痕桌面端", post_execution: false }];
      },
      (raw) => { (raw.actions[0].review as Record<string, unknown>).before_period_end = null; },
      (raw) => {
        const action = raw.actions[0] as Record<string, unknown>;
        ((action.events as unknown[])[0] as Record<string, unknown>).event_type = "";
      },
      (raw) => {
        const report = raw.report as Record<string, unknown>;
        (report.metrics as Record<string, unknown>).current_spend = "1e3";
      },
    ];
    for (const mutate of mutations) {
      const raw = workbenchPayload();
      mutate(raw);
      expect(normalizeWorkbenchPayload(raw).contractComplete).toBe(false);
    }
  });

  it("requires server operability and mutually exclusive action-specific plan amounts", () => {
    const serverReadOnly = workbenchPayload();
    serverReadOnly.report.operable = false;
    for (const action of serverReadOnly.actions) action.operable = false;
    const data = normalizeWorkbenchPayload(serverReadOnly);
    expect(data.contractComplete).toBe(true);
    expect(data.report.operable).toBe(false);
    expect(data.actions.every((action) => actionPermissions(data, action, OWNER_ID).canExecute === false)).toBe(true);

    const mixedPlan = workbenchPayload();
    mixedPlan.actions[0].planned_down_amount = "1.000000";
    expect(normalizeWorkbenchPayload(mixedPlan).contractComplete).toBe(false);

    const unquantifiedPlans = workbenchPayload();
    unquantifiedPlans.actions[0].planned_up_amount = null;
    unquantifiedPlans.actions[1].planned_down_amount = null;
    unquantifiedPlans.actions[2].suggested_budget_or_test_cap = null;
    expect(normalizeWorkbenchPayload(unquantifiedPlans).contractComplete).toBe(true);
  });

  it("accepts PostgreSQL RFC3339 microseconds and legal offsets while showing null plan values as pending quantification", () => {
    const raw = workbenchPayload();
    raw.report.created_at = "2026-08-26T06:00:00.123456+08:00";
    raw.report.published_at = "2026-08-26T07:00:00.1-07:00";
    raw.actions[0].review_due_at = "2026-09-17T07:00:00.123456+00:00";
    raw.actions[0].planned_up_amount = null;
    raw.actions[0].events = [{
      event_type: "Owner已分配",
      occurred_at: "2026-08-26T08:00:00.123456+08:00",
      actor_display_name: "创建人",
      reason: null,
    }];
    (raw.actions[0].review as Record<string, unknown>).data_mature_at = "2026-09-16T07:00:00.123456+00:00";

    const data = normalizeWorkbenchPayload(raw);
    expect(data.contractComplete).toBe(true);
    render(<WorkbenchView data={data} viewerUserId={OWNER_ID} operations={operations()} />);
    const keyword = screen.getAllByText("wireless carplay adapter").find((node) => node.closest("tr"));
    expect(keyword).toBeDefined();
    expect(within(keyword!.closest("tr")!).getByText("待量化")).toBeVisible();
  });

  it("separates review history visibility, dataset upload, formal submit, and creator close", () => {
    const raw = workbenchPayload();
    raw.actions[0].action_status = "已复盘";
    (raw.actions[0].review as Record<string, unknown>).review_status = "已提交";
    const data = normalizeWorkbenchPayload(raw);
    const owner = actionPermissions(data, data.actions[0], OWNER_ID);
    const creator = actionPermissions(data, data.actions[0], CREATOR_ID);
    expect(owner).toMatchObject({ canViewReview: true, canUploadReview: false, canSubmitReview: false, canClose: false });
    expect(creator).toMatchObject({ canViewReview: true, canUploadReview: false, canSubmitReview: false, canClose: true });

    const observing = workbenchPayload();
    observing.actions[0].action_status = "观察中";
    const observingData = normalizeWorkbenchPayload(observing);
    expect(actionPermissions(observingData, observingData.actions[0], OWNER_ID)).toMatchObject({
      canViewReview: true,
      canUploadReview: true,
      canSubmitReview: false,
    });

    const blocked = workbenchPayload();
    blocked.actions[0].action_status = "待复盘";
    blocked.actions[0].review = {
      ...(blocked.actions[0].review as Record<string, unknown>),
      review_status: "归因未成熟",
      comparable: false,
      maturity_status: "归因未成熟",
      blockers: ["归因未成熟"],
    };
    const blockedData = normalizeWorkbenchPayload(blocked);
    expect(actionPermissions(blockedData, blockedData.actions[0], OWNER_ID)).toMatchObject({
      canViewReview: true,
      canUploadReview: true,
      canSubmitReview: false,
    });
  });

  it("accepts an Owner SQL-shaped payload with no member directory and keeps its visible metrics aligned to its actions", () => {
    const raw = workbenchPayload();
    raw.report.workspace_members = [];
    raw.report.metrics = {
      current_spend: "12.000000",
      current_sales: "40.000000",
      planned_up_amount: "2.000000",
      planned_down_amount: "0.000000",
      risk_spend: "0.000000",
      test_budget: "0.000000",
    };
    raw.actions = [structuredClone(raw.actions[0])];
    raw.actions[0].action_status = "观察中";
    raw.actions[0].current_spend = "12.000000";
    raw.actions[0].current_sales = "40.000000";

    const data = normalizeWorkbenchPayload(raw);
    expect(data.contractComplete).toBe(true);
    expect(data.report.workspaceMembers).toEqual([]);
    expect(data.report.metrics).toMatchObject({ currentSpend: "12.000000", currentSales: "40.000000" });
    expect(data.actions).toHaveLength(1);
    expect(actionPermissions(data, data.actions[0], OWNER_ID)).toMatchObject({
      canAssignOwner: false,
      canViewReview: true,
      canUploadReview: true,
    });
  });

  it("lets the creator close a submitted reviewed action even when SQL marks terminal actions non-operable", () => {
    const raw = workbenchPayload();
    raw.actions = [structuredClone(raw.actions[0])];
    raw.actions[0].action_status = "已复盘";
    raw.actions[0].operable = false;
    raw.actions[0].review = {
      ...(raw.actions[0].review as Record<string, unknown>),
      review_status: "已提交",
    };
    const data = normalizeWorkbenchPayload(raw);
    expect(data.contractComplete).toBe(true);
    expect(actionPermissions(data, data.actions[0], CREATOR_ID)).toMatchObject({
      canAssignOwner: false,
      canUploadReview: false,
      canClose: true,
    });
  });

  it("maps browser changes only to the controlled RPC allowlist and never exposes base/event-table mutation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const from = vi.fn(() => { throw new Error("base table access is forbidden"); });
    const client = { auth: {}, storage: { from }, from, rpc } as unknown as SupabaseClient;
    const { workbench } = createSupabaseServices({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      client,
    });

    await workbench.assignActionOwner({ actionItemId: "71000000-0000-0000-0000-000000000001", ownerUserId: OWNER_ID, plannedExecutionDate: "2026-08-27" });
    await workbench.confirmActionScope({
      actionItemId: "71000000-0000-0000-0000-000000000001",
      campaignId: "campaign-1",
      adGroupId: "ad-group-1",
      targetId: "target-1",
      targetType: "keyword",
      matchType: "PHRASE",
      searchTerm: "wireless carplay adapter",
      targetExpression: "wireless carplay adapter",
      sourceLocator: "manual-sheet:A42",
    });
    await workbench.markActionExecuted({ actionItemId: "71000000-0000-0000-0000-000000000001", actualBid: "2.75", actualBudget: null, actualNegativeAction: null });
    await workbench.submitActionReview({ actionItemId: "71000000-0000-0000-0000-000000000001", beforeDatasetId: "91000000-0000-0000-0000-000000000001", afterDatasetId: "91000000-0000-0000-0000-000000000002", reviewResult: "达标" });
    await workbench.requestActionCancel({ actionItemId: "71000000-0000-0000-0000-000000000001", reason: "预算调整" });
    await workbench.confirmActionCancel("71000000-0000-0000-0000-000000000001");
    await workbench.closeAction("71000000-0000-0000-0000-000000000001");
    await workbench.confirmRankCheckRequest({
      requestId: "73000000-0000-0000-0000-000000000001",
      idempotencyKey: "74000000-0000-0000-0000-000000000001",
    });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "assign_action_owner_v2",
      "confirm_action_scope_v2",
      "mark_action_executed_v2",
      "submit_action_review_v2",
      "request_action_cancel_v2",
      "confirm_action_cancel_v2",
      "close_action_v2",
      "confirm_daily_rank_check_request_v1",
    ]);
    expect(rpc).toHaveBeenNthCalledWith(2, "confirm_action_scope_v2", {
      p_action_item_id: "71000000-0000-0000-0000-000000000001",
      p_campaign_id: "campaign-1",
      p_ad_group_id: "ad-group-1",
      p_target_id: "target-1",
      p_target_type: "keyword",
      p_match_type: "PHRASE",
      p_search_term: "wireless carplay adapter",
      p_target_expression: "wireless carplay adapter",
      p_source_locator: "manual-sheet:A42",
    });
    expect(from).not.toHaveBeenCalled();
    expect(workbench).not.toHaveProperty("insertActionEvent");
    expect(workbench).not.toHaveProperty("updateReportRow");
    expect(workbench).not.toHaveProperty("clearBlocker");
  });

  it("requires the review preflight response to echo the exact report, action and dataset role binding", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      reviewDatasetId: "91000000-0000-0000-0000-000000000001",
      reportId: "41000000-0000-0000-0000-000000000099",
      actionItemId: "71000000-0000-0000-0000-000000000001",
      datasetRole: "执行前基准",
      comparable: true,
      blockers: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const api = createApiService({
      apiBaseUrl: "https://api.example.test",
      getAccessToken: vi.fn().mockResolvedValue("current-session-token"),
      fetchImpl,
    });
    await expect(api.runReviewDatasetPreflight({
      sessionId: "81000000-0000-0000-0000-000000000001",
      reportId: "41000000-0000-0000-0000-000000000001",
      actionItemId: "71000000-0000-0000-0000-000000000001",
      datasetRole: "执行前基准",
    })).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/v1/review-datasets/81000000-0000-0000-0000-000000000001/preflight"),
      expect.objectContaining({ body: JSON.stringify({
        reportId: "41000000-0000-0000-0000-000000000001",
        actionItemId: "71000000-0000-0000-0000-000000000001",
        datasetRole: "执行前基准",
      }) }),
    );
  });
});
