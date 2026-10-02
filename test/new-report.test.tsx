import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes, type WebServices } from "../src/app/App";
import { SubmissionError } from "../src/lib/api";
import type { PreflightFeeDialog, V2PreflightFeeDialog } from "../src/lib/api";
import { readPublicConfig } from "../src/lib/config";

const WORKSPACE_ID = "21000000-0000-0000-0000-000000000001";
const SESSION_ID = "81000000-0000-0000-0000-000000000001";
const TASK_ID = "61000000-0000-0000-0000-000000000001";
const FILE_HASH = "a".repeat(64);
const PREFLIGHT_HASH = "b".repeat(64);
const EXPIRES_AT = "2026-08-27T08:00:00.000Z";

const session = {
  accessToken: "user-session-token",
  user: { id: "11000000-0000-0000-0000-000000000001", email: "owner@example.test" },
};

const feeDialogSource = {
  asin: "B0ABC12345",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-14",
  periodDays: 14,
  marketplace: "US" as const,
  currency: "USD" as const,
  reportType: "Sponsored Products Search Term Report",
  attributionDaysCandidates: [14],
  attributionMetricGroups: [{
    id: "sp-sales-orders-14d",
    worksheets: ["Sponsored Products Search Term"],
    days: 14,
    fieldGroup: "14 Day Total Sales and Orders",
    occurrence: 1,
    headers: ["14 Day Total Sales", "14 Day Total Orders"],
    metrics: ["sales", "orders"] as const,
  }],
  estimatedKeywordCount: 36,
  calculationBasis: {
    keywordCount: 36,
    parserVersion: "preflight-2",
  },
  manualExecutionScopeRequired: false,
  preflightStatus: "可确认" as const,
  preflightBlockers: [] as string[],
  preflightWarnings: [] as string[],
};

const feeDialog: V2PreflightFeeDialog = {
  ...feeDialogSource,
  responseSchemaVersion: "preflight-fee-dialog-v2",
  feeQuote: { state: "unavailable", reasonCode: "PARAMETERS_REQUIRED" },
};

const legacyFeeDialog: PreflightFeeDialog = {
  ...feeDialogSource,
  responseSchemaVersion: "preflight-fee-dialog-v1",
  estimatedXiyouCredits: "72.000000",
  estimatedDoubaoCost: "1.250000",
  calculationBasis: { ...feeDialogSource.calculationBasis, pricingVersion: "2026-08-24-v1" },
};

const readyQuote = {
  state: "ready" as const,
  quoteId: "55000000-0000-4000-8000-000000000001",
  quoteHash: "c".repeat(64),
  feeProtocolVersion: "provider-fees-v2" as const,
  expiresAt: "2030-08-27T08:00:00.000Z",
  current: true,
  providers: [
    { provider: "豆包" as const, currencyOrUnit: "CNY" as const, estimatedCost: "1.250000", lockedCap: "1.250000" },
    { provider: "西柚" as const, currencyOrUnit: "credits" as const, estimatedCost: "72.000000", lockedCap: "72.000000" },
  ] as const,
};
const FEE_REQUEST_ID = "56000000-0000-4000-8000-000000000001";

interface ServiceOverrides extends Omit<Partial<WebServices>, "auth" | "api" | "supabase"> {
  auth?: Partial<WebServices["auth"]>;
  api?: Partial<WebServices["api"]>;
  supabase?: Partial<WebServices["supabase"]>;
}

function services(overrides: ServiceOverrides = {}): WebServices {
  const base: WebServices = {
    auth: {
      getSession: vi.fn().mockResolvedValue(session),
      onAuthStateChange: vi.fn(() => () => undefined),
      signIn: vi.fn().mockResolvedValue(undefined),
      signUp: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
    },
    api: {
      createUploadSession: vi.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        bucket: "private-inbox",
        path: "workspaces/server-selected/report.xlsx",
        token: "one-time-upload-token",
        expiresAt: EXPIRES_AT,
      }),
      runPreflight: vi.fn().mockResolvedValue(feeDialog),
      refreshFeeQuote: vi.fn().mockResolvedValue({ ...feeDialog, feeQuote: readyQuote }),
      runReviewDatasetPreflight: vi.fn(),
      requestSnapshotUrl: vi.fn(),
      createRankCheckQuote: vi.fn(),
    },
    supabase: {
      uploadToSignedUrl: vi.fn().mockResolvedValue(undefined),
      setPreflightParameters: vi.fn().mockResolvedValue(PREFLIGHT_HASH),
      confirmKeywordTask: vi.fn().mockResolvedValue(TASK_ID),
      cancelUploadSession: vi.fn().mockResolvedValue(undefined),
    },
    hashFile: vi.fn().mockResolvedValue(FILE_HASH),
    createIdempotencyKey: vi.fn(() => "client-confirmation-key"),
    createFeeQuoteRequestId: vi.fn(() => FEE_REQUEST_ID),
    workbench: {
      getTaskCostSummary: vi.fn(), resolveActiveReportId: vi.fn(), getReportWorkbench: vi.fn(), assignActionOwner: vi.fn(),
      confirmActionScope: vi.fn(), markActionExecuted: vi.fn(), submitActionReview: vi.fn(),
      requestActionCancel: vi.fn(), confirmActionCancel: vi.fn(), closeAction: vi.fn(),
      confirmReviewDataset: vi.fn(), preflightReviewDataset: vi.fn(), requestSnapshotUrl: vi.fn(),
      createRankCheckQuote: vi.fn(), confirmRankCheckRequest: vi.fn(),
    },
  };
  return {
    ...base,
    ...overrides,
    auth: { ...base.auth, ...overrides.auth },
    api: { ...base.api, ...overrides.api },
    supabase: { ...base.supabase, ...overrides.supabase },
  };
}

function renderRoute(service: WebServices, route = "/new-report") {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppRoutes services={service} />
    </MemoryRouter>,
  );
}

async function selectValidReport(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { name: "新建关键词分析报告" });
  await user.type(screen.getByLabelText("工作区 ID"), WORKSPACE_ID);
  await user.type(screen.getByLabelText("ASIN"), "B0ABC12345");
  const file = new File(["keyword,campaign\ncarplay,SP Exact"], "report.csv", {
    type: "text/csv",
  });
  await user.upload(screen.getByLabelText("广告报告文件"), file);
  return file;
}

async function runPreflight(
  user: ReturnType<typeof userEvent.setup>,
  service: WebServices,
  shouldRender = true,
) {
  if (shouldRender) renderRoute(service);
  const file = await selectValidReport(user);
  await user.click(screen.getByRole("button", { name: "运行免费预检" }));
  await screen.findByRole("heading", { name: "费用与口径确认" });
  return file;
}

async function confirmParameters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "确认分析口径" }));
  await screen.findByText("分析口径已锁定，可进行费用确认。", {}, { timeout: 2_000 });
}

describe("authenticated report submission", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not create a task before explicit cost confirmation and separates business USD from provider fees", async () => {
    const user = userEvent.setup();
    const service = services();

    await runPreflight(user, service);

    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
    expect(screen.getByText("经营数据币种").parentElement).toHaveTextContent("USD（仅业务数据）");
    expect(screen.getAllByText("暂不可确认")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "确认费用并开始分析" })).toBeDisabled();

    await confirmParameters(user);

    expect(screen.getByText("预估西柚费用").parentElement).toHaveTextContent("72.000000 credits");
    expect(screen.getByText("预估豆包费用").parentElement).toHaveTextContent("1.250000 CNY");
    expect(screen.getByText("2026-08-01 至 2026-08-14（14 天）")).toBeVisible();
    expect(screen.getByText("US / USD / America/Los_Angeles")).toBeVisible();
    expect(screen.getByText("14 天 / 14 Day Total Sales and Orders")).toBeVisible();
    expect(screen.getByText("36 个关键词；解析器 preflight-2")).toBeVisible();
    expect(screen.getByText(`临时上传到期：${EXPIRES_AT}（24 小时）`)).toBeVisible();
    expect(screen.getByText("西柚确认上限：72.000000 credits")).toBeVisible();
    expect(screen.getByText("豆包确认上限：1.250000 CNY")).toBeVisible();
    expect(service.api.refreshFeeQuote).toHaveBeenCalledWith({ sessionId: SESSION_ID, requestId: FEE_REQUEST_ID });
    expect(screen.getByRole("button", { name: "确认费用并开始分析" })).toBeEnabled();
  });

  it("binds upload token to the server-selected bucket/path and always disables upsert", async () => {
    const user = userEvent.setup();
    const service = services();
    const file = await runPreflight(user, service);

    expect(service.api.createUploadSession).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      originalFilename: "report.csv",
      fileHash: FILE_HASH,
      uploadPurpose: "初始分析",
    });
    expect(service.supabase.uploadToSignedUrl).toHaveBeenCalledWith({
      bucket: "private-inbox",
      path: "workspaces/server-selected/report.xlsx",
      token: "one-time-upload-token",
      file,
      upsert: false,
    });
    expect(service.api.runPreflight).toHaveBeenCalledWith(SESSION_ID);
  });

  it("rejects an entered ASIN that differs from the persisted detected ASIN before fee confirmation", async () => {
    const user = userEvent.setup();
    const service = services({
      api: { runPreflight: vi.fn().mockResolvedValue({ ...feeDialog, asin: "B0OTHER001" }) },
    });
    renderRoute(service);
    await selectValidReport(user);
    await user.click(screen.getByRole("button", { name: "运行免费预检" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("文件检测到的 ASIN 与输入 ASIN 不一致");
    expect(screen.queryByRole("button", { name: "确认费用并开始分析" })).not.toBeInTheDocument();
    expect(service.supabase.setPreflightParameters).not.toHaveBeenCalled();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
  });

  it("disables duplicate confirmation, reuses one client key, and keeps the returned task id", async () => {
    const user = userEvent.setup();
    const service = services();
    await runPreflight(user, service);
    await confirmParameters(user);

    await user.dblClick(screen.getByRole("button", { name: "确认费用并开始分析" }));

    expect(await screen.findByText(`任务 ${TASK_ID} 已进入队列`)).toBeVisible();
    const calls = vi.mocked(service.supabase.confirmKeywordTask).mock.calls;
    expect(calls).toHaveLength(1);
    expect(new Set(calls.map(([input]) => input.idempotencyKey)).size).toBe(1);
    expect(calls[0]?.[0]).toMatchObject({
      sessionId: SESSION_ID,
      fileHash: FILE_HASH,
      preflightHash: PREFLIGHT_HASH,
      idempotencyKey: "client-confirmation-key",
      asin: "B0ABC12345",
      quoteId: readyQuote.quoteId,
      quoteHash: readyQuote.quoteHash,
    });
    expect(service.createIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "确认费用并开始分析" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开任务工作台" }))
      .toHaveAttribute("href", `/tasks/${TASK_ID}/workbench`);
  });

  it("shows unavailable pricing as not confirmable without calling it free or zero", async () => {
    const user = userEvent.setup();
    const service = services({
      api: {
        runPreflight: vi.fn().mockResolvedValue({
          ...feeDialog,
          feeQuote: { state: "unavailable", reasonCode: "PRICING_UNAVAILABLE" },
        }),
      },
    });
    await runPreflight(user, service);

    expect(await screen.findByText(/暂无法提供可信费用报价/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "确认费用并开始分析" })).toBeDisabled();
    expect(screen.queryByText("免费")).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.000000/u)).not.toBeInTheDocument();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
  });

  it("keeps historical legacy amounts in USD and makes the legacy dialog read-only", async () => {
    const user = userEvent.setup();
    const service = services({ api: { runPreflight: vi.fn().mockResolvedValue(legacyFeeDialog) } });
    await runPreflight(user, service);

    expect(screen.getByText("1.250000 USD")).toBeVisible();
    expect(screen.getByText("豆包历史上限：1.250000 USD")).toBeVisible();
    expect(screen.getByRole("button", { name: "确认费用并开始分析" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认分析口径" })).toBeDisabled();
    expect(service.api.refreshFeeQuote).not.toHaveBeenCalled();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
  });

  it("blocks cost confirmation while preflight has unresolved parameters", async () => {
    const user = userEvent.setup();
    const service = services({
      api: {
        runPreflight: vi.fn().mockResolvedValue({
          ...feeDialog,
          periodStart: null,
          periodEnd: null,
          periodDays: null,
          attributionDaysCandidates: [],
          attributionMetricGroups: [],
          preflightStatus: "需补口径",
          preflightBlockers: ["待补报告周期", "待确认归因窗口"],
        }),
      },
    });
    await runPreflight(user, service);

    const blockers = screen.getByText("费用确认前必须补齐：").parentElement!;
    expect(within(blockers).getByText("待补报告周期")).toBeVisible();
    expect(within(blockers).getByText("待确认归因窗口")).toBeVisible();
    expect(screen.getByRole("button", { name: "确认费用并开始分析" })).toBeDisabled();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
  });

  it("requires an explicit attribution-group choice when Preflight returns multiple candidates", async () => {
    const user = userEvent.setup();
    const sevenDayGroup = {
      ...feeDialog.attributionMetricGroups[0],
      id: "sp-sales-orders-7d",
      days: 7,
      fieldGroup: "7 Day Total Sales and Orders",
    };
    const service = services({
      api: {
        runPreflight: vi.fn().mockResolvedValue({
          ...feeDialog,
          attributionDaysCandidates: [7, 14],
          attributionMetricGroups: [sevenDayGroup, feeDialog.attributionMetricGroups[0]],
          preflightStatus: "需补口径",
          preflightBlockers: ["请选择归因字段组"],
        }),
      },
    });
    await runPreflight(user, service);

    const groupSelect = screen.getByLabelText("归因字段组");
    expect(groupSelect).toHaveValue("");
    expect(within(groupSelect).getByRole("option", { name: /7 天.*7 Day Total/u })).toBeVisible();
    expect(within(groupSelect).getByRole("option", { name: /14 天.*14 Day Total/u })).toBeVisible();
    expect(screen.getByLabelText("归因天数")).toHaveValue(null);
    expect(screen.getByRole("button", { name: "确认分析口径" })).toBeDisabled();

    await user.selectOptions(groupSelect, "sp-sales-orders-14d");
    expect(screen.getByLabelText("归因天数")).toHaveValue(14);
    await user.click(screen.getByRole("button", { name: "确认分析口径" }));
    await screen.findByText("分析口径已锁定，可进行费用确认。");
    expect(service.supabase.setPreflightParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        attributionDays: 14,
        attributionMetricGroup: "sp-sales-orders-14d",
      }),
    );
  });

  it("uses target_acos 0.35 and replaces mutable controls with the accepted parameter snapshot", async () => {
    const user = userEvent.setup();
    let resolveParameterLock: ((value: string) => void) | undefined;
    const parameterLock = new Promise<string>((resolve) => {
      resolveParameterLock = resolve;
    });
    const service = services({
      supabase: { setPreflightParameters: vi.fn(() => parameterLock) },
    });
    await runPreflight(user, service);

    expect(screen.getByLabelText("target_acos（0–1）")).toHaveValue("0.35");
    await user.click(screen.getByRole("button", { name: "确认分析口径" }));
    expect(screen.getByRole("group", { name: "分析口径" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "正在锁定口径…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消并等待安全清理" })).toBeDisabled();
    expect(service.supabase.setPreflightParameters).toHaveBeenCalledWith(
      expect.objectContaining({ targetAcos: "0.35" }),
    );

    await act(async () => resolveParameterLock?.(PREFLIGHT_HASH));
    const summary = await screen.findByLabelText("已锁定分析口径");
    expect(within(summary).getByText("0.35")).toBeVisible();
    expect(within(summary).getByText("14 天 / sp-sales-orders-14d")).toBeVisible();
    expect(screen.queryByLabelText("target_acos（0–1）")).not.toBeInTheDocument();
  });

  it("cancels through the controlled RPC, marks cleanup pending, and never enqueues", async () => {
    const user = userEvent.setup();
    const service = services();
    await runPreflight(user, service);

    await user.click(screen.getByRole("button", { name: "取消并等待安全清理" }));

    expect(service.supabase.cancelUploadSession).toHaveBeenCalledWith(SESSION_ID);
    expect(await screen.findByText("上传已取消；服务端已标记待安全清理。未创建任务，也未授权费用。")).toBeVisible();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
  });

  it("leaving or closing the page never creates a task", async () => {
    const user = userEvent.setup();
    const service = services();
    const rendered = renderRoute(service);
    await runPreflight(user, service, false);

    window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    rendered.unmount();

    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
    expect(service.supabase.cancelUploadSession).not.toHaveBeenCalled();
  });

  it("keeps confirmation locked after an ambiguous network result so no new fee authorization is generated", async () => {
    const user = userEvent.setup();
    const confirmKeywordTask = vi.fn()
      .mockRejectedValueOnce(new SubmissionError("CONFIRMATION_OUTCOME_UNKNOWN", "network", true))
      .mockResolvedValueOnce(TASK_ID);
    const service = services({
      supabase: {
        confirmKeywordTask,
      },
    });
    await runPreflight(user, service);
    await confirmParameters(user);
    await user.click(screen.getByRole("button", { name: "确认费用并开始分析" }));

    expect(await screen.findByText("费用确认结果暂时无法判定；不会换新确认键或报价，可使用原确认键安全重试。"))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "使用原确认键重试确认" })).toBeEnabled();
    expect(service.supabase.confirmKeywordTask).toHaveBeenCalledTimes(1);
    expect(service.createIdempotencyKey).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "使用原确认键重试确认" }));
    expect(await screen.findByText(`任务 ${TASK_ID} 已进入队列`)).toBeVisible();
    expect(confirmKeywordTask).toHaveBeenCalledTimes(2);
    expect(confirmKeywordTask.mock.calls[1]?.[0]).toMatchObject({
      idempotencyKey: "client-confirmation-key",
      quoteId: readyQuote.quoteId,
      quoteHash: readyQuote.quoteHash,
    });
    expect(new Set(confirmKeywordTask.mock.calls.map(([input]) => input.idempotencyKey)).size).toBe(1);
    expect(service.createIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it("clears the previous quote when parameters change and requests a fresh quote with a new request ID", async () => {
    const user = userEvent.setup();
    const createFeeQuoteRequestId = vi.fn()
      .mockReturnValueOnce(FEE_REQUEST_ID)
      .mockReturnValueOnce("56000000-0000-4000-8000-000000000002");
    const service = services({ createFeeQuoteRequestId });
    await runPreflight(user, service);
    await confirmParameters(user);
    expect(screen.getByText("预估豆包费用").parentElement).toHaveTextContent("1.250000 CNY");

    await user.click(screen.getByRole("button", { name: "修改分析口径" }));
    expect(screen.getAllByText("暂不可确认")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "确认费用并开始分析" })).toBeDisabled();
    expect(screen.getByLabelText("target_acos（0–1）")).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "确认分析口径" }));
    await screen.findByText("分析口径已锁定，可进行费用确认。");
    expect(service.api.refreshFeeQuote).toHaveBeenNthCalledWith(2, {
      sessionId: SESSION_ID,
      requestId: "56000000-0000-4000-8000-000000000002",
    });
  });

  it("does not use an expired quote and allows an explicit replacement quote", async () => {
    const user = userEvent.setup();
    const expiredQuote = { ...readyQuote, expiresAt: "2020-01-01T00:00:00.000Z" };
    const refreshFeeQuote = vi.fn()
      .mockResolvedValueOnce({ ...feeDialog, feeQuote: expiredQuote })
      .mockResolvedValueOnce({ ...feeDialog, feeQuote: readyQuote });
    const createFeeQuoteRequestId = vi.fn()
      .mockReturnValueOnce(FEE_REQUEST_ID)
      .mockReturnValueOnce("56000000-0000-4000-8000-000000000003");
    const service = services({ api: { refreshFeeQuote }, createFeeQuoteRequestId });
    await runPreflight(user, service);
    await user.click(screen.getByRole("button", { name: "确认分析口径" }));

    expect(await screen.findByText("报价已过期，请刷新报价并重新确认。")).toBeVisible();
    expect(screen.getByRole("button", { name: "报价已过期" })).toBeDisabled();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "刷新可信费用报价" }));
    expect(await screen.findByText("预估豆包费用")).toBeVisible();
    expect(screen.getByText("预估豆包费用").parentElement).toHaveTextContent("1.250000 CNY");
    expect(service.api.refreshFeeQuote).toHaveBeenNthCalledWith(2, {
      sessionId: SESSION_ID,
      requestId: "56000000-0000-4000-8000-000000000003",
    });
  });

  it("retries an ambiguous quote outcome with the same quote request ID", async () => {
    const user = userEvent.setup();
    const refreshFeeQuote = vi.fn()
      .mockRejectedValueOnce(new SubmissionError("NETWORK_FAILURE", "network", true))
      .mockResolvedValueOnce({ ...feeDialog, feeQuote: readyQuote });
    const service = services({ api: { refreshFeeQuote } });
    await runPreflight(user, service);
    await user.click(screen.getByRole("button", { name: "确认分析口径" }));

    expect(await screen.findByText(/报价保存结果待核对/u)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "使用同一请求重试报价" }));
    await waitFor(() => expect(screen.getByText("预估豆包费用").parentElement).toHaveTextContent("1.250000 CNY"));

    expect(refreshFeeQuote).toHaveBeenCalledTimes(2);
    expect(refreshFeeQuote).toHaveBeenNthCalledWith(1, { sessionId: SESSION_ID, requestId: FEE_REQUEST_ID });
    expect(refreshFeeQuote).toHaveBeenNthCalledWith(2, { sessionId: SESSION_ID, requestId: FEE_REQUEST_ID });
    expect(service.createFeeQuoteRequestId).toHaveBeenCalledTimes(1);
  });

  it("discards an in-flight quote when authentication switches to another user", async () => {
    const user = userEvent.setup();
    let changeAuth: ((next: typeof session | null) => void) | undefined;
    let resolveQuote: ((value: typeof feeDialog & { feeQuote: typeof readyQuote }) => void) | undefined;
    const refreshFeeQuote = vi.fn(() => new Promise<typeof feeDialog & { feeQuote: typeof readyQuote }>((resolve) => {
      resolveQuote = resolve;
    }));
    const service = services({
      auth: {
        onAuthStateChange: vi.fn((listener) => {
          changeAuth = listener;
          return () => undefined;
        }),
      },
      api: { refreshFeeQuote },
    });
    await runPreflight(user, service);
    await user.click(screen.getByRole("button", { name: "确认分析口径" }));
    await waitFor(() => expect(refreshFeeQuote).toHaveBeenCalledTimes(1));

    await act(async () => {
      changeAuth?.({ ...session, user: { id: "11000000-0000-0000-0000-000000000002", email: "other@example.test" } });
    });
    await act(async () => resolveQuote?.({ ...feeDialog, feeQuote: readyQuote }));

    expect(await screen.findByRole("heading", { name: "新建关键词分析报告" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "费用与口径确认" })).not.toBeInTheDocument();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
  });

  it("retries a definitive confirmation rejection only with the original idempotency key", async () => {
    const user = userEvent.setup();
    const confirmKeywordTask = vi.fn()
      .mockRejectedValueOnce(new SubmissionError("22023", "validation", false))
      .mockResolvedValueOnce(TASK_ID);
    const service = services({ supabase: { confirmKeywordTask } });
    await runPreflight(user, service);
    await confirmParameters(user);

    await user.click(screen.getByRole("button", { name: "确认费用并开始分析" }));
    expect(await screen.findByText("费用确认被服务端明确拒绝；未生成新授权，可检查后使用原确认键重试。"))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "确认费用并开始分析" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "确认费用并开始分析" }));
    expect(await screen.findByText(`任务 ${TASK_ID} 已进入队列`)).toBeVisible();
    expect(confirmKeywordTask).toHaveBeenCalledTimes(2);
    expect(new Set(confirmKeywordTask.mock.calls.map(([input]) => input.idempotencyKey)).size).toBe(1);
    expect(service.createIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it("reports an upload transport failure as an unpaid safe retry", async () => {
    const user = userEvent.setup();
    const service = services({
      supabase: {
        uploadToSignedUrl: vi.fn().mockRejectedValue(
          new SubmissionError("UPLOAD_TRANSPORT_FAILURE", "network", false),
        ),
      },
    });
    renderRoute(service);
    await selectValidReport(user);
    await user.click(screen.getByRole("button", { name: "运行免费预检" }));

    expect(await screen.findByText("上传网络失败，尚未确认费用；可安全重试免费上传步骤。"))
      .toBeVisible();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
  });

  it("reports an expired session without classifying it as a network ambiguity", async () => {
    const user = userEvent.setup();
    const service = services({
      api: {
        runPreflight: vi.fn().mockRejectedValue(
          new SubmissionError("UPLOAD_SESSION_EXPIRED", "expired", false),
        ),
      },
    });
    renderRoute(service);
    await selectValidReport(user);
    await user.click(screen.getByRole("button", { name: "运行免费预检" }));

    expect(await screen.findByText("上传会话已到期或状态不可用，请重新选择文件。"))
      .toBeVisible();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
  });

  it("rejects an invalid ASIN, unsupported type, and files over 20 MB before session creation", async () => {
    const user = userEvent.setup();
    const service = services();
    renderRoute(service);
    await screen.findByRole("heading", { name: "新建关键词分析报告" });
    await user.type(screen.getByLabelText("工作区 ID"), WORKSPACE_ID);
    await user.type(screen.getByLabelText("ASIN"), "bad-asin");
    await user.upload(
      screen.getByLabelText("广告报告文件"),
      new File(["bad"], "report.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "运行免费预检" }));
    expect(await screen.findByText("ASIN 必须是 10 位字母或数字。")).toBeVisible();

    await user.clear(screen.getByLabelText("ASIN"));
    await user.type(screen.getByLabelText("ASIN"), "B0ABC12345");
    await user.click(screen.getByRole("button", { name: "运行免费预检" }));
    expect(await screen.findByText("仅支持 .xlsx 或 .csv 报告文件。")).toBeVisible();

    await user.upload(
      screen.getByLabelText("广告报告文件"),
      new File([new Uint8Array(20 * 1024 * 1024 + 1)], "too-large.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "运行免费预检" }));
    expect(await screen.findByText("文件不能超过 20 MB。")).toBeVisible();
    expect(service.api.createUploadSession).not.toHaveBeenCalled();
  });

  it("explains a disabled-member rejection from the very next protected API call", async () => {
    const user = userEvent.setup();
    const service = services({
      api: {
        createUploadSession: vi.fn().mockRejectedValue(
          new SubmissionError("FORBIDDEN", "forbidden", false),
        ),
      },
    });
    renderRoute(service);
    await selectValidReport(user);
    await user.click(screen.getByRole("button", { name: "运行免费预检" }));

    expect(await screen.findByText("当前成员权限已停用或无权执行此操作，请重新登录或联系管理员。"))
      .toBeVisible();
    expect(service.supabase.confirmKeywordTask).not.toHaveBeenCalled();
  });
});

describe("authentication routes", () => {
  it("redirects an unauthenticated protected route to login", async () => {
    const service = services({
      auth: { getSession: vi.fn().mockResolvedValue(null) },
    });
    renderRoute(service);
    expect(await screen.findByRole("heading", { name: "登录关键词分析" })).toBeVisible();
  });

  it("redirects an authenticated user away from login", async () => {
    const service = services();
    renderRoute(service, "/auth");
    expect(await screen.findByRole("heading", { name: "新建关键词分析报告" })).toBeVisible();
  });

  it("supports explicit login and registration without storing a background credential", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue(undefined);
    const signUp = vi.fn().mockResolvedValue(undefined);
    const service = services({
      auth: { getSession: vi.fn().mockResolvedValue(null), signIn, signUp },
    });
    renderRoute(service, "/auth");
    await screen.findByRole("heading", { name: "登录关键词分析" });
    await user.type(screen.getByLabelText("邮箱"), "owner@example.test");
    await user.type(screen.getByLabelText("密码"), "correct-horse-battery-staple");
    await user.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("owner@example.test", "correct-horse-battery-staple"));

    await user.click(screen.getByRole("button", { name: "注册" }));
    await waitFor(() => expect(signUp).toHaveBeenCalledWith("owner@example.test", "correct-horse-battery-staple"));
  });
});

describe("public browser configuration", () => {
  it("accepts only the three public values and rejects a background secret key", () => {
    const valid = readPublicConfig({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test",
      VITE_API_BASE_URL: "https://api.example.test",
      VITE_UNEXPECTED_SERVER_VALUE: "must-not-cross-the-boundary",
    });
    expect(valid).toEqual({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "sb_publishable_browser_test",
      apiBaseUrl: "https://api.example.test",
    });
    expect(() => readPublicConfig({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_" + "secret_server_test",
      VITE_API_BASE_URL: "https://api.example.test",
    })).toThrow(/publishable/u);
    expect(() => readPublicConfig({
      VITE_SUPABASE_URL: "javascript://localhost/callback",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test",
      VITE_API_BASE_URL: "https://api.example.test",
    })).toThrow(/HTTPS/u);
  });
});
