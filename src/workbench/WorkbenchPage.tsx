import { useCallback, useEffect, useRef, useState } from "react";

import { humanizeSubmissionError } from "../lib/api";
import { ActionDrawer } from "./ActionDrawer";
import { ActionTable } from "./ActionTable";
import { Dashboard } from "./Dashboard";
import { TaskCostSummary } from './TaskCostSummary';
import { normalizeTaskCostSummary } from './task-cost-contract';
import type { TaskCostSummaryData } from './types';
import { normalizeWorkbenchPayload, shouldMaskWorkbenchAmounts } from "./contract";
import { formatPercent } from "./fixed-decimal";
import type { WorkbenchPageServices } from "./services";
import type { ExecutionValues, ReportWorkbench, WorkbenchAction, WorkbenchFilter, WorkbenchOperations } from "./types";

export function WorkbenchView({
  data,
  viewerUserId,
  operations,
}: {
  data: ReportWorkbench;
  viewerUserId: string;
  operations: WorkbenchOperations;
}) {
  const [filter, setFilter] = useState<WorkbenchFilter>("all");
  const [selected, setSelected] = useState<WorkbenchAction | null>(null);
  const report = data.report;
  const amountsBlocked = shouldMaskWorkbenchAmounts(data);
  useEffect(() => {
    setSelected((current) => current
      ? data.actions.find((action) => action.actionItemId === current.actionItemId) ?? null
      : null);
  }, [data.actions]);
  return (
    <main className="workbench-shell">
      <header className="workbench-header">
        <div><p className="eyebrow">Keyword Battle Tool</p><h1>关键词经营工作台</h1><p className="lede">{report.asin} · 报告 v{report.versionNumber}</p></div>
        <button type="button" onClick={() => operations.downloadSnapshot()}>下载私有快照（5 分钟）</button>
      </header>
      <section className="report-context" aria-label="报告口径">
        <span>{report.periodStart ?? "待补"} 至 {report.periodEnd ?? "待补"}（{report.periodDays ?? "待补"} 天）</span>
        <span>目标 ACOS {!data.contractComplete || !report.targetAcos ? "待补" : `${formatPercent(report.targetAcos)}%`}</span>
        <span>归因 {report.attributionDays ?? "待补"} 天 / {report.attributionMetricGroup ?? "待补"}</span>
        <span>{report.marketplace} / {report.currency} / {report.marketplaceTimezone}</span>
        <span>分析 {report.analysisVersion} · 快照 {report.snapshotVersion}</span>
      </section>
      {!report.isActiveVersion || report.reportStatus === "已替代" ? <p className="notice" role="status">已替代版本只读：可查看证据，但不能执行、复盘、取消或关闭。</p> : null}
      <Dashboard workbench={data} activeFilter={filter} onFilterChange={setFilter} />
      <ActionTable actions={data.actions} filter={filter} amountsBlocked={amountsBlocked}
        currency={report.currency} targetAcos={report.targetAcos} onOpen={setSelected} />
      {selected ? <ActionDrawer data={data} action={selected} viewerUserId={viewerUserId} operations={operations} onClose={() => setSelected(null)} /> : null}
    </main>
  );
}

type WorkbenchPageProps = { reportId?: string; taskId?: string; viewerUserId: string; services: WorkbenchPageServices };
export function WorkbenchPage(props: WorkbenchPageProps) {
  // A route/identity boundary must clear sensitive data on the first render,
  // not one effect later. Old requests can only target an unmounted instance.
  return <ScopedWorkbenchPage key={JSON.stringify([props.viewerUserId, props.reportId, props.taskId])} {...props} />;
}
function ScopedWorkbenchPage({
  reportId,
  taskId,
  viewerUserId,
  services,
}: {
  reportId?: string;
  taskId?: string;
  viewerUserId: string;
  services: WorkbenchPageServices;
}) {
  const [resolvedReportId, setResolvedReportId] = useState<string | null>(reportId ?? null);
  const [data, setData] = useState<ReportWorkbench | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TaskCostSummaryData | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current += 1; }; }, []);

  const load = useCallback(async (id: string, expectedEpoch = epoch.current) => {
    if (!mounted.current || expectedEpoch !== epoch.current) return;
    setError(null);
    try {
      const loaded = normalizeWorkbenchPayload(await services.getReportWorkbench(id));
      if (loaded.report.reportId !== id || (taskId && loaded.report.taskId !== taskId)) throw new Error('REPORT_IDENTITY_CHANGED');
      if (mounted.current && expectedEpoch === epoch.current) setData(loaded);
    } catch { if (mounted.current && expectedEpoch === epoch.current) setError("工作台加载失败或当前身份无权访问。"); }
  }, [services, taskId]);

  useEffect(() => {
    let active = true;
    const generation = ++epoch.current;
    setData(null); setSummary(null); setError(null); setMessage(null); setResolvedReportId(null);
    void (async () => {
      try {
        let costs: TaskCostSummaryData | null = null;
        if (taskId) {
          costs = normalizeTaskCostSummary(await services.getTaskCostSummary(taskId));
          if (!active) return;
          if (costs.taskId !== taskId) throw new Error('TASK_COST_UNAVAILABLE');
          setSummary(costs);
          if (costs.reportId === null) { setMessage('报告尚未发布；费用摘要可查看，操作与下载暂不可用。'); return; }
        }
        const id = reportId ?? (taskId ? await services.resolveActiveReportId(taskId) : null);
        if (!id || !active) return;
        if (costs && costs.reportId !== id) throw new Error('REPORT_IDENTITY_CHANGED');
        setResolvedReportId(id);
        await load(id, generation);
      } catch {
        if (active) setError("报告尚未发布，或当前身份无权访问任务工作台。");
      }
    })();
    return () => { active = false; };
  }, [load, reportId, services, taskId]);

  async function mutate(operation: () => Promise<unknown>, success: string) {
    const generation = epoch.current;
    setError(null); setMessage(null);
    try {
      await operation(); if (!mounted.current || generation !== epoch.current) return; setMessage(success);
      if (resolvedReportId) await load(resolvedReportId, generation);
    } catch { if (mounted.current && generation === epoch.current) setError("操作被受控服务拒绝，未直接修改任何底表或事件。"); }
  }

  const operations: WorkbenchOperations = {
    assignOwner: (action, ownerUserId, plannedExecutionDate) => {
      if (!ownerUserId || !plannedExecutionDate) return;
      void mutate(() => services.assignActionOwner({ actionItemId: action.actionItemId, ownerUserId, plannedExecutionDate }), "Owner 已通过受控 RPC 分配。");
    },
    confirmScope: (action, executionScope) => {
      if (!executionScope) return;
      void mutate(() => services.confirmActionScope({ actionItemId: action.actionItemId, ...executionScope }), "手工作用域已确认。");
    },
    execute: (action, values?: ExecutionValues) => {
      if (!values) return;
      void mutate(() => services.markActionExecuted({ actionItemId: action.actionItemId, ...values }), "实际执行值已登记。");
    },
    submitReview: (action, reviewResult) => {
      const { beforeDatasetId, afterDatasetId } = action.review;
      if (!beforeDatasetId || !afterDatasetId) { setError("缺少可比的执行前/后数据集，不能提交复盘。"); return; }
      void mutate(() => services.submitActionReview({ actionItemId: action.actionItemId, beforeDatasetId, afterDatasetId, reviewResult }), "复盘已通过受控 RPC 提交。");
    },
    requestCancel: (action, reason) => {
      if (!reason) return;
      void mutate(() => services.requestActionCancel({ actionItemId: action.actionItemId, reason }), "取消申请已提交创建人确认。");
    },
    confirmCancel: (action) => { void mutate(() => services.confirmActionCancel(action.actionItemId), "取消已确认。"); },
    close: (action) => { void mutate(() => services.closeAction(action.actionItemId), "动作已由创建人关闭。"); },
    quoteRankCheck: (action, observationDate) => services.createRankCheckQuote(action.actionItemId, observationDate),
    confirmRankCheck: (action, quote) => {
      if (quote.actionItemId !== action.actionItemId) return;
      void mutate(() => services.confirmRankCheckRequest({
        requestId: quote.requestId,
        idempotencyKey: quote.idempotencyKey,
      }), "XYDC 历史小时趋势费用已确认并进入受控队列；结果需到账单核对后才正式成立。");
    },
    preflightReviewDataset: (action, role, file) => {
      if (!data) return;
      void (async () => {
        try {
          const result = await services.preflightReviewDataset({
            workspaceId: data.report.workspaceId,
            reportId: data.report.reportId,
            actionItemId: action.actionItemId,
            datasetRole: role,
            file,
          });
          if (!result.comparable || result.blockers.length) {
            setError(`复盘 Preflight 阻塞：${result.blockers.join("；") || "关键维度不可比"}`);
            return;
          }
          await services.confirmReviewDataset(result.reviewDatasetId);
          setMessage(`${action.keyword} 的复盘数据集已通过 Preflight 并受控确认。`);
          if (resolvedReportId) await load(resolvedReportId);
        } catch (error) {
          setError(`复盘 Preflight 阻塞：${humanizeSubmissionError(error)}`);
        }
      })();
    },
    downloadSnapshot: () => {
      if (!resolvedReportId) return;
      void (async () => {
        try {
          const snapshot = await services.requestSnapshotUrl(resolvedReportId);
          if (mounted.current) window.open(snapshot.signedUrl, "_blank", "noopener,noreferrer");
        } catch { setError("私有快照签名失败或当前身份无权访问。"); }
      })();
    },
  };

  if (!data && summary) return <main className="loading-shell"><TaskCostSummary summary={summary} />
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}</main>;
  if (error && !data) return <main className="loading-shell"><p role="alert">{error}</p></main>;
  if (!data) return <main className="loading-shell" role="status">正在加载受控工作台…</main>;
  return <>{summary ? <TaskCostSummary summary={summary} /> : null}<WorkbenchView data={data} viewerUserId={viewerUserId} operations={operations} />
    {message ? <p className="success-notice floating-notice" role="status">{message}</p> : null}
    {error ? <p className="error-notice floating-notice" role="alert">{error}</p> : null}</>;
}
