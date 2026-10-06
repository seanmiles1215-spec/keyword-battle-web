import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppRoutes, type WebServices } from "../src/app/App";
import { Dashboard } from "../src/workbench/Dashboard";
import { ReviewPanel } from "../src/workbench/ReviewPanel";
import { WorkbenchPage, WorkbenchView } from "../src/workbench/WorkbenchPage";
import { normalizeWorkbenchPayload } from "../src/workbench/contract";
import { SubmissionError } from "../src/lib/api";
import {
  CREATOR_ID,
  OWNER_ID,
  REPORT_ID,
  TASK_ID,
  workbenchPayload,
} from "./workbench-fixtures";

function workbenchServices(payload = workbenchPayload()) {
  return {
    getTaskCostSummary: vi.fn().mockResolvedValue({ taskId: TASK_ID, taskStatus: '完成', reportId: REPORT_ID, publicationReady: true,
      providers: ['豆包','西柚'].map(provider => ({ provider, currencyOrUnit: provider === '豆包' ? 'USD' : 'credits',
        estimatedCost: null, lockedCap: '1.000000', confirmedActual: '0.000000', unresolvedReserved: '0.000000', pendingCount: 0, uncertainCount: 0, overCap: false })) }),
    resolveActiveReportId: vi.fn().mockResolvedValue(REPORT_ID),
    getReportWorkbench: vi.fn().mockResolvedValue(payload),
    assignActionOwner: vi.fn().mockResolvedValue(true),
    confirmActionScope: vi.fn().mockResolvedValue(true),
    markActionExecuted: vi.fn().mockResolvedValue(true),
    submitActionReview: vi.fn().mockResolvedValue(true),
    requestActionCancel: vi.fn().mockResolvedValue(true),
    confirmActionCancel: vi.fn().mockResolvedValue(true),
    closeAction: vi.fn().mockResolvedValue(true),
    createRankCheckQuote: vi.fn().mockResolvedValue({
      requestId: "73000000-0000-0000-0000-000000000001",
      actionItemId: "71000000-0000-0000-0000-000000000001",
      idempotencyKey: "74000000-0000-0000-0000-000000000001",
      observationDate: "2026-09-20", estimatedCredits: "1.000000", environmentLabel: "XYDC / US / 历史日级趋势",
      quoteVersion: "rank-quote-xydc-daily-v1", standardVersion: "xydc-daily-rank-v1", requestStatus: "待确认",
    }),
    confirmRankCheckRequest: vi.fn().mockResolvedValue(true),
    preflightReviewDataset: vi.fn().mockResolvedValue({
      reviewDatasetId: "91000000-0000-0000-0000-000000000001",
      reportId: REPORT_ID,
      actionItemId: "71000000-0000-0000-0000-000000000001",
      datasetRole: "执行前基准",
      comparable: true,
      blockers: [],
    }),
    confirmReviewDataset: vi.fn().mockResolvedValue(true),
    requestSnapshotUrl: vi.fn().mockResolvedValue({
      signedUrl: `https://private.example.test/keyword-battle-tool/reports/${REPORT_ID}/vsnapshot-v1.html?OSSAccessKeyId=test&Expires=1780000000&Signature=test`,
      expiresInSeconds: 300,
    }),
  };
}

function viewOperations() {
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

describe("dynamic two-layer workbench", () => {
  it("shows planning-estimate dashboard totals while keeping test terms out of incremental sales", () => {
    const data = normalizeWorkbenchPayload(workbenchPayload());
    const { rerender } = render(<Dashboard workbench={data} activeFilter="all" onFilterChange={vi.fn()} />);

    expect(screen.getByRole("region", { name: "经营驾驶舱" })).toBeVisible();
    expect(screen.getAllByText("规划估算").length).toBeGreaterThan(0);
    expect(screen.getByText("USD 10.00")).toBeVisible();
    expect(screen.getByText("USD 28.00")).toBeVisible();
    expect(screen.getByText("USD 250.00")).toBeVisible();
    expect(screen.getByText("USD 500.00")).toBeVisible();
    expect(screen.getByText("USD 105.00")).toBeVisible();
    expect(within(screen.getByText("当前花费").closest("article")!).queryByText("规划估算")).not.toBeInTheDocument();
    expect(within(screen.getByText("规划增投额").closest("article")!).getByText("规划估算")).toBeVisible();

    const testSummary = screen.getByTestId("test-summary");
    expect(within(testSummary).getByText("1 个待测试词")).toBeVisible();
    expect(within(testSummary).getByText("规划估算 · 测试预算 USD 12.00 / 验证 14 天")).toBeVisible();
    expect(within(testSummary).queryByText(/预计.*销售/u)).not.toBeInTheDocument();

    const raw = workbenchPayload();
    const actions: Array<Record<string, unknown>> = raw.actions;
    actions.push({
      ...raw.actions[0],
      action_item_id: "71000000-0000-0000-0000-000000000099",
      report_row_id: "51000000-0000-0000-0000-000000000099",
      keyword: "sample-insufficient expansion",
      sample_sufficient: false,
      estimated_incremental_sales: "999.000000",
    });
    rerender(<Dashboard workbench={normalizeWorkbenchPayload(raw)} activeFilter="all" onFilterChange={vi.fn()} />);

    const incremental = screen.getByTestId("top-incremental");
    expect(within(incremental).getByText("wireless carplay adapter")).toBeVisible();
    expect(within(incremental).queryByText("待测试词")).not.toBeInTheDocument();
    expect(within(incremental).queryByText("sample-insufficient expansion")).not.toBeInTheDocument();
  });

  it("makes every operating amount card a filter control and never totals a missing fixed decimal as zero", async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const data = normalizeWorkbenchPayload(workbenchPayload());
    const { rerender } = render(<Dashboard workbench={data} activeFilter="all" onFilterChange={onFilterChange} />);
    for (const [name, filter] of [
      ["当前花费 USD 250.00", "all"],
      ["当前销售额 USD 500.00", "all"],
      ["规划增投额 USD 10.00", "增量放大"],
      ["规划降投额 USD 28.00", "stop-loss"],
      ["风险花费 USD 105.00", "stop-loss"],
    ] as const) {
      await user.click(screen.getByRole("button", { name: new RegExp(name) }));
      expect(onFilterChange).toHaveBeenLastCalledWith(filter);
    }

    const missing = workbenchPayload();
    (missing.report.metrics as Record<string, unknown>).current_spend = null;
    rerender(<Dashboard workbench={normalizeWorkbenchPayload(missing)} activeFilter="all" onFilterChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /当前花费 不可计算/u })).toBeVisible();
    expect(screen.queryByRole("button", { name: /当前花费 USD 0\.00/u })).not.toBeInTheDocument();
  });

  it("masks every operating/planning amount on a blocker or abnormal period but keeps structural filters", async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const blocked = normalizeWorkbenchPayload(workbenchPayload({
      report: { report_blocker: "待补口径", period_days: null },
    }));
    const { rerender } = render(<Dashboard workbench={blocked} activeFilter="all" onFilterChange={onFilterChange} />);

    expect(screen.getByRole("alert")).toHaveTextContent("待补口径");
    expect(screen.getAllByText("待补口径").length).toBeGreaterThanOrEqual(6);
    await user.click(screen.getByRole("button", { name: "筛选增量放大" }));
    expect(onFilterChange).toHaveBeenCalledWith("增量放大");

    const reversed = normalizeWorkbenchPayload(workbenchPayload({
      report: { period_start: "2026-08-14", period_end: "2026-08-01", period_days: 14 },
    }));
    rerender(<Dashboard workbench={reversed} activeFilter="all" onFilterChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("待补口径");
    rerender(<Dashboard workbench={normalizeWorkbenchPayload(workbenchPayload({
      report: { period_start: "2026-08-01", period_end: "2026-08-14", period_days: 13 },
    }))} activeFilter="all" onFilterChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("待补口径");
  });

  it("masks unaccepted build/validation amounts and server-read-only active amounts while preserving accepted superseded history", () => {
    const building = workbenchPayload({ report: { report_status: "构建中", published_at: null, operable: false } });
    for (const action of building.actions) action.operable = false;
    const { rerender } = render(<Dashboard workbench={normalizeWorkbenchPayload(building)} activeFilter="all" onFilterChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /当前花费 待补口径/u })).toBeVisible();
    expect(screen.queryByText("USD 250.00")).not.toBeInTheDocument();

    const publishedReadOnly = workbenchPayload({ report: { operable: false } });
    for (const action of publishedReadOnly.actions) action.operable = false;
    rerender(<Dashboard workbench={normalizeWorkbenchPayload(publishedReadOnly)} activeFilter="all" onFilterChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /当前花费 待补口径/u })).toBeVisible();

    const superseded = workbenchPayload({
      report: { report_status: "已替代", is_active_version: false, operable: false },
    });
    for (const action of superseded.actions) action.operable = false;
    rerender(<Dashboard workbench={normalizeWorkbenchPayload(superseded)} activeFilter="all" onFilterChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /当前花费 USD 250\.00/u })).toBeVisible();
  });

  it("also masks operating and planning values in the action layer while a report is blocked", () => {
    const blocked = normalizeWorkbenchPayload(workbenchPayload({ report: { report_blocker: "待补口径" } }));
    render(<WorkbenchView data={blocked} viewerUserId={CREATOR_ID} operations={viewOperations()} />);
    const table = screen.getByRole("table", { name: "桌面执行作战表" });
    expect(within(table).getAllByText("待补口径").length).toBeGreaterThan(5);
    expect(within(table).queryByText(/2\.500000/u)).not.toBeInTheDocument();
  });

  it("links dashboard filters to text-and-icon actions and renders desktop table plus mobile cards", async () => {
    const user = userEvent.setup();
    const data = normalizeWorkbenchPayload(workbenchPayload());
    render(<WorkbenchView data={data} viewerUserId={CREATOR_ID} operations={viewOperations()} />);

    expect(screen.getByRole("table", { name: "桌面执行作战表" })).toHaveClass("desktop-action-table");
    expect(screen.getByRole("list", { name: "移动执行作战表" })).toHaveClass("mobile-action-cards");
    expect(screen.getAllByText("增量放大").some((node) => node.closest(".action-label")?.textContent?.includes("↗"))).toBe(true);
    expect(screen.getAllByText("止损整改").some((node) => node.closest(".action-label")?.textContent?.includes("🛑"))).toBe(true);
    expect(screen.getAllByText("待测试").some((node) => node.closest(".action-label")?.textContent?.includes("🧪"))).toBe(true);
    expect(screen.getAllByText("降投保护").some((node) => node.closest(".action-label")?.textContent?.includes("🛡"))).toBe(true);
    expect(screen.getAllByText("暂不处理").some((node) => node.closest(".action-label")?.textContent?.includes("⏸"))).toBe(true);

    await user.click(screen.getByRole("button", { name: "筛选待测试" }));
    const table = screen.getByRole("table", { name: "桌面执行作战表" });
    expect(within(table).getByText("待测试词")).toBeVisible();
    expect(within(table).queryByText("wireless carplay adapter")).not.toBeInTheDocument();
  });

  it("shows the decision fields in desktop, mobile, and detail views", async () => {
    const user = userEvent.setup();
    render(<WorkbenchView data={normalizeWorkbenchPayload(workbenchPayload())} viewerUserId={OWNER_ID} operations={viewOperations()} />);
    const table = screen.getByRole("table", { name: "桌面执行作战表" });
    expect(within(table).getByText("花费 / 销售")).toBeVisible();
    expect(within(table).getByText("ACOS / 目标")).toBeVisible();
    expect(within(table).getByText("风险花费")).toBeVisible();
    expect(within(table).getByText("当前出价 → 建议出价 / 测试上限")).toBeVisible();
    expect(within(table).getAllByText(/2\.400000 → 2\.610000–2\.890000/u).length).toBeGreaterThan(0);
    expect(within(table).queryAllByText(/2\.500000 → 2\.610000–2\.890000/u)).toHaveLength(0);
    const mobile = screen.getByRole("list", { name: "移动执行作战表" });
    expect(within(mobile).getAllByText(/花费 USD/u).length).toBeGreaterThan(0);
    expect(within(mobile).getAllByText(/目标 ACOS/u).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    const drawer = screen.getByRole("dialog", { name: "动作证据详情" });
    expect(within(drawer).getByText("当前花费 / 销售")).toBeVisible();
    expect(within(drawer).getByText("当前 ACOS / 目标 ACOS")).toBeVisible();
    expect(within(drawer).getByText("风险花费")).toBeVisible();
    expect(within(drawer).getByText("当前出价 → 建议出价 / 测试上限")).toBeVisible();
  });

  it("normalizes a SQL-shaped DTO with publication facts, allowed history, competitors and a valid rank drop", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload() as Record<string, unknown>;
    raw.snapshot_object_key = "must-not-render";
    raw.object_path = "private/source.csv";
    raw.checkpoint = { paid: true };
    const first = (raw.actions as Array<Record<string, unknown>>)[0];
    first.executed_at = "2026-08-26T07:00:00.000Z";
    first.rank_checks = [
      { request_status: "成功", checked_at: "2026-08-27T08:00:00.000Z", observation_date: null, natural_rank: 11, environment_label: "US / 90001 / 无痕桌面端", post_execution: true, billing_state: "旧版记录", standard_version: "rank-quote-v1", completed_evidence: true },
      { request_status: "成功", checked_at: "2026-08-27T12:00:00.000Z", observation_date: null, natural_rank: 18, environment_label: "US / 10001 / 无痕桌面端", post_execution: true, billing_state: "旧版记录", standard_version: "rank-quote-v1", completed_evidence: true },
      { request_status: "成功", checked_at: "2026-08-28T08:00:00.000Z", observation_date: null, natural_rank: 14, environment_label: "US / 90001 / 无痕桌面端", post_execution: true, billing_state: "旧版记录", standard_version: "rank-quote-v1", completed_evidence: true },
      { request_status: "成功", checked_at: "2026-09-20T08:00:00.000Z", observation_date: "2026-09-20", natural_rank: null, environment_label: "XYDC / US / 历史小时趋势", post_execution: true, billing_state: "结果已保存，账单待核对", standard_version: "xydc-historical-rank-v1", completed_evidence: false },
    ];
    first.rank_double_drop_alert = false;
    const data = normalizeWorkbenchPayload(raw);
    render(<WorkbenchView data={data} viewerUserId={OWNER_ID} operations={viewOperations()} />);

    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    const drawer = screen.getByRole("dialog", { name: "动作证据详情" });
    expect(within(drawer).getByText("转化样本充分，且当前 ACOS 低于目标。")).toBeVisible();
    expect(within(drawer).getByText("点击 40")).toBeVisible();
    expect(within(drawer).getByText("D+7 加归因窗口后复盘", { exact: false })).toBeVisible();
    expect(within(drawer).getByText("B0COMP0001")).toBeVisible();
    expect(within(drawer).getByText("2026-W34：126")).toBeVisible();
    expect(within(drawer).getByText("Owner已分配")).toBeVisible();
    expect(within(drawer).getByText("Amazon Ads 搜索词报告")).toBeVisible();
    expect(within(drawer).getAllByText(/旧版记录 · US \/ 90001 \/ 无痕桌面端/u)).toHaveLength(2);
    expect(drawer).toHaveTextContent("结果已保存，账单待核对");
    expect(within(drawer).getByText("XYDC / US / 历史日级趋势。请选择需要复查的单日历史日期。")).toBeVisible();
    expect(within(drawer).queryByText("自然位两次跌出前 10，停止继续降投并复核。")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("must-not-render");
    expect(document.body).not.toHaveTextContent("private/source.csv");
    expect(document.body).not.toHaveTextContent("checkpoint");
  });

  it("shows planned/executed/review dates and action-specific actual values in the action detail", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload();
    raw.actions[0].executed_at = "2026-08-27T09:30:00.000Z";
    raw.actions[0].actual_bid = "2.750000";
    const data = normalizeWorkbenchPayload(raw);
    render(<WorkbenchView data={data} viewerUserId={OWNER_ID} operations={viewOperations()} />);

    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    const drawer = screen.getByRole("dialog", { name: "动作证据详情" });
    expect(within(drawer).getByText("计划执行日")).toBeVisible();
    expect(within(drawer).getByText("2026-08-27")).toBeVisible();
    expect(within(drawer).getByText("实际执行时间")).toBeVisible();
    expect(within(drawer).getByText("2026-08-27T09:30:00.000Z")).toBeVisible();
    expect(within(drawer).getByText("复盘截止时间")).toBeVisible();
    expect(within(drawer).getByText("2026-09-17T07:00:00.000Z")).toBeVisible();
    expect(within(drawer).getByText("实际出价")).toBeVisible();
    expect(within(drawer).getByText("USD 2.75")).toBeVisible();
  });

  it("does not show the double-drop warning for mixed environments, failed checks, or intervals below 24 hours", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload();
    raw.actions[0].executed_at = "2026-08-26T07:00:00.000Z";
    raw.actions[0].rank_checks = [
      { request_status: "成功", checked_at: "2026-08-27T08:00:00.000Z", observation_date: null, natural_rank: 11, environment_label: "US / 90001 / 无痕桌面端", post_execution: true, billing_state: "旧版记录", standard_version: "rank-quote-v1", completed_evidence: true },
      { request_status: "失败", checked_at: "2026-08-29T08:00:00.000Z", observation_date: null, natural_rank: 20, environment_label: "US / 90001 / 无痕桌面端", post_execution: true, billing_state: "旧版记录", standard_version: "rank-quote-v1", completed_evidence: false },
      { request_status: "成功", checked_at: "2026-08-27T12:00:00.000Z", observation_date: null, natural_rank: 15, environment_label: "US / 10001 / 无痕桌面端", post_execution: true, billing_state: "旧版记录", standard_version: "rank-quote-v1", completed_evidence: true },
    ];
    const data = normalizeWorkbenchPayload(raw);
    render(<WorkbenchView data={data} viewerUserId={OWNER_ID} operations={viewOperations()} />);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    expect(screen.queryByText("自然位两次跌出前 10，停止继续降投并复核。")).not.toBeInTheDocument();
  });

  it("uses the server alert for any two qualifying drops even with a recovery between them", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload();
    raw.actions[0].executed_at = "2026-08-26T07:00:00.000Z";
    raw.actions[0].rank_checks = [
      { request_status: "成功", checked_at: "2026-08-27T08:00:00.000Z", observation_date: "2026-08-27", natural_rank: 11, environment_label: "XYDC / US / 历史小时趋势", post_execution: true, billing_state: "成功", standard_version: "xydc-historical-rank-v1", completed_evidence: true },
      { request_status: "成功", checked_at: "2026-08-28T08:00:00.000Z", observation_date: "2026-08-28", natural_rank: 5, environment_label: "XYDC / US / 历史小时趋势", post_execution: true, billing_state: "成功", standard_version: "xydc-historical-rank-v1", completed_evidence: true },
      { request_status: "成功", checked_at: "2026-08-29T08:00:00.000Z", observation_date: "2026-08-29", natural_rank: 15, environment_label: "XYDC / US / 历史小时趋势", post_execution: true, billing_state: "成功", standard_version: "xydc-historical-rank-v1", completed_evidence: true },
    ];
    raw.actions[0].rank_double_drop_alert = true;
    render(<WorkbenchView data={normalizeWorkbenchPayload(raw)} viewerUserId={OWNER_ID} operations={viewOperations()} />);
    await user.click(screen.getAllByRole("button", { name: "查看 wireless carplay adapter 详情" })[0]);
    expect(screen.getByText("自然位两次跌出前 10，停止继续降投并复核。")).toBeVisible();
  });

  it("quotes server-derived rank cost before confirming the same request and idempotency key", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload();
    raw.actions[0].executed_at = "2026-08-26T07:00:00.000Z";
    raw.actions[0].action_status = "观察中";
    const service = workbenchServices(raw);
    render(<WorkbenchPage reportId={REPORT_ID} viewerUserId={OWNER_ID} services={service} />);

    await user.click((await screen.findAllByRole("button", { name: "查看 wireless carplay adapter 详情" }))[0]);
    expect(screen.getByRole("button", { name: "创建历史趋势报价" })).toBeDisabled();
    await user.type(screen.getByLabelText("历史趋势日期"), "2026-09-20");
    await user.click(screen.getByRole("button", { name: "创建历史趋势报价" }));
    expect(await screen.findByText("单日最多 1 Credit；账单核对与排名证据资格分开记录。")).toBeVisible();
    expect(screen.getByText("服务：XYDC / US / 历史日级趋势")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "确认费用并发起历史趋势查询" }));

    expect(service.createRankCheckQuote).toHaveBeenCalledWith("71000000-0000-0000-0000-000000000001", "2026-09-20");
    await waitFor(() => expect(service.confirmRankCheckRequest).toHaveBeenCalledWith({
      requestId: "73000000-0000-0000-0000-000000000001",
      idempotencyKey: "74000000-0000-0000-0000-000000000001",
    }));
  });

  it("treats a lost rank-quote response as unknown and tells the user the retry reuses one request", async () => {
    const user = userEvent.setup();
    const raw = workbenchPayload();
    raw.actions[0].executed_at = "2026-08-26T07:00:00.000Z";
    raw.actions[0].action_status = "观察中";
    const service = workbenchServices(raw);
    service.createRankCheckQuote.mockRejectedValueOnce(
      new SubmissionError("NETWORK_FAILURE", "network", true),
    );
    render(<WorkbenchPage reportId={REPORT_ID} viewerUserId={OWNER_ID} services={service} />);

    await user.click((await screen.findAllByRole("button", { name: "查看 wireless carplay adapter 详情" }))[0]);
    await user.type(screen.getByLabelText("历史趋势日期"), "2026-09-20");
    await user.click(screen.getByRole("button", { name: "创建历史趋势报价" }));

    expect(await screen.findByText("报价状态未确认；请重试，系统将复用同一请求，不会重复授权费用。")).toBeVisible();
    expect(screen.getByRole("button", { name: "创建历史趋势报价" })).toBeEnabled();
  });

  it("shows comparable D-7..D-1 and D+1..D+7 ACOS math, but withholds invalid improvement", () => {
    const data = normalizeWorkbenchPayload(workbenchPayload());
    const action = data.actions[0];
    const { rerender } = render(<ReviewPanel action={action} canSubmit onSubmit={vi.fn()} onPreflightDataset={vi.fn()} />);
    expect(screen.getByText("D-7..D-1：2026-08-19 至 2026-08-25")).toBeVisible();
    expect(screen.getByText("D+1..D+7：2026-08-27 至 2026-09-02")).toBeVisible();
    expect(screen.getByText("执行前 ACOS 40.00%")).toBeVisible();
    expect(screen.getByText("执行后 ACOS 30.00%")).toBeVisible();
    expect(screen.getByText("百分点变化 -10.00 pp")).toBeVisible();
    expect(screen.getByText("改善率 25.00%")).toBeVisible();

    const zeroBefore = normalizeWorkbenchPayload(workbenchPayload());
    zeroBefore.actions[0].review.beforeAcos = "0.00000000";
    rerender(<ReviewPanel action={zeroBefore.actions[0]} canSubmit onSubmit={vi.fn()} onPreflightDataset={vi.fn()} />);
    expect(screen.queryByText(/改善率/u)).not.toBeInTheDocument();
  });

  it("shows comparability and maturity blockers and disables formal review submission", () => {
    const raw = workbenchPayload();
    raw.actions[0].review = {
      ...(raw.actions[0].review as Record<string, unknown>),
      comparable: false,
      maturity_status: "归因未成熟",
      blockers: ["归因字段组不一致", "正式成熟日未到"],
    };
    const action = normalizeWorkbenchPayload(raw).actions[0];
    render(<ReviewPanel action={action} canSubmit onSubmit={vi.fn()} onPreflightDataset={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("归因字段组不一致");
    expect(screen.getByRole("alert")).toHaveTextContent("正式成熟日未到");
    expect(screen.getByRole("button", { name: "提交复盘" })).toBeDisabled();
  });

  it("requests one five-minute signed snapshot and opens it without rendering or caching the object key", async () => {
    const user = userEvent.setup();
    const service = workbenchServices();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<WorkbenchPage reportId={REPORT_ID} viewerUserId={CREATOR_ID} services={service} />);

    await screen.findByRole("heading", { name: "关键词经营工作台" });
    await user.click(screen.getByRole("button", { name: "下载私有快照（5 分钟）" }));
    expect(service.requestSnapshotUrl).toHaveBeenCalledWith(REPORT_ID);
    expect(open).toHaveBeenCalledWith(expect.stringContaining("Expires="), "_blank", "noopener,noreferrer");
    expect(document.body).not.toHaveTextContent("keyword-battle-tool/reports");
  });

  it("reloads a SQL-shaped confirmed manual scope and renders the new campaign and ad-group IDs without stale names", async () => {
    const user = userEvent.setup();
    const initial = workbenchPayload();
    initial.actions[0].campaign_id = "campaign-old";
    initial.actions[0].campaign_name = "Stale Campaign Name";
    initial.actions[0].ad_group_id = "ad-group-old";
    initial.actions[0].ad_group_name = "Stale Ad Group Name";
    initial.actions[0].execution_scope = {};
    initial.actions[0].execution_scope_status = "手工执行范围待确认";
    initial.actions[0].operable = false;

    const confirmed = structuredClone(initial);
    confirmed.actions[0].campaign_id = "campaign-confirmed";
    confirmed.actions[0].campaign_name = null;
    confirmed.actions[0].ad_group_id = "ad-group-confirmed";
    confirmed.actions[0].ad_group_name = null;
    confirmed.actions[0].target_id = "target-confirmed";
    confirmed.actions[0].target_type = "keyword";
    confirmed.actions[0].target_expression = "wireless carplay adapter";
    confirmed.actions[0].execution_scope = {
      campaign_id: "campaign-confirmed",
      ad_group_id: "ad-group-confirmed",
      target_id: "target-confirmed",
      target_type: "keyword",
      target_expression: "wireless carplay adapter",
      source_locator: "manual-sheet:A42",
    };
    confirmed.actions[0].execution_scope_status = "已人工确认";
    confirmed.actions[0].operable = true;

    const service = workbenchServices(initial);
    service.getReportWorkbench
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(confirmed);
    render(<WorkbenchPage reportId={REPORT_ID} viewerUserId={OWNER_ID} services={service} />);

    await user.click((await screen.findAllByRole("button", { name: "查看 wireless carplay adapter 详情" }))[0]);
    await user.click(screen.getByRole("button", { name: "确认手工作用域" }));
    for (const [label, value] of [
      ["Campaign ID", "campaign-confirmed"],
      ["Ad Group ID", "ad-group-confirmed"],
      ["Target ID", "target-confirmed"],
      ["Target Type", "keyword"],
      ["Target Expression", "wireless carplay adapter"],
      ["Source Locator", "manual-sheet:A42"],
    ]) await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: "提交作用域确认" }));

    await waitFor(() => expect(service.confirmActionScope).toHaveBeenCalledWith({
      actionItemId: "71000000-0000-0000-0000-000000000001",
      campaignId: "campaign-confirmed",
      adGroupId: "ad-group-confirmed",
      targetId: "target-confirmed",
      targetType: "keyword",
      matchType: null,
      searchTerm: null,
      targetExpression: "wireless carplay adapter",
      sourceLocator: "manual-sheet:A42",
    }));
    await waitFor(() => expect(service.getReportWorkbench).toHaveBeenCalledTimes(2));

    const detailGrid = screen.getByRole("dialog", { name: "动作证据详情" })
      .querySelector<HTMLElement>(".detail-grid");
    expect(detailGrid).not.toBeNull();
    expect(within(detailGrid!).getByText("campaign-confirmed")).toBeVisible();
    expect(within(detailGrid!).getByText("ad-group-confirmed")).toBeVisible();
    expect(within(detailGrid!).queryByText("Stale Campaign Name")).not.toBeInTheDocument();
    expect(within(detailGrid!).queryByText("Stale Ad Group Name")).not.toBeInTheDocument();
  });

  it("shows a safe review mismatch blocker and does not confirm a rejected dataset", async () => {
    const user = userEvent.setup();
    const payload = workbenchPayload();
    payload.actions[0].action_status = "观察中";
    const service = workbenchServices(payload);
    service.preflightReviewDataset.mockRejectedValue(
      new SubmissionError("REVIEW_ASIN_MISMATCH", "validation"),
    );
    render(<WorkbenchPage reportId={REPORT_ID} viewerUserId={CREATOR_ID} services={service} />);

    await user.click((await screen.findAllByRole("button", { name: "查看 wireless carplay adapter 详情" }))[0]);
    await user.click(screen.getByRole("button", { name: "上传复盘报表" }));
    await user.upload(screen.getByLabelText("执行后结果报表"), new File(["review"], "review.xlsx"));

    expect(await screen.findByRole("alert")).toHaveTextContent("复盘文件 ASIN 与动作报告不一致。");
    expect(service.confirmReviewDataset).not.toHaveBeenCalled();
  });

  it("protects direct report and task-outcome workbench routes", async () => {
    const unauthenticated = {
      auth: {
        getSession: vi.fn().mockResolvedValue(null),
        onAuthStateChange: vi.fn(() => () => undefined),
        signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(),
      },
      api: {} as WebServices["api"],
      supabase: {} as WebServices["supabase"],
      workbench: workbenchServices(),
      hashFile: vi.fn(),
      createTaskId: vi.fn(),
      createIdempotencyKey: vi.fn(),
      createFeeQuoteRequestId: vi.fn(),
    } satisfies WebServices;
    const { unmount } = render(
      <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes services={unauthenticated} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "登录关键词分析" })).toBeVisible();
    unmount();

    const authenticated = {
      ...unauthenticated,
      auth: {
        ...unauthenticated.auth,
        getSession: vi.fn().mockResolvedValue({ accessToken: "token", user: { id: CREATOR_ID } }),
      },
    } satisfies WebServices;
    render(
      <MemoryRouter initialEntries={[`/tasks/${TASK_ID}/workbench`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes services={authenticated} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "关键词经营工作台" })).toBeVisible();
    expect(authenticated.workbench.resolveActiveReportId).toHaveBeenCalledWith(TASK_ID);
  });
});
