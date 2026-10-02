import { useState } from "react";

import { ActionLabel } from "./ActionTable";
import { shouldMaskWorkbenchAmounts } from "./contract";
import { ExecutionDialog } from "./ExecutionDialog";
import { OwnerDialog } from "./OwnerDialog";
import { ReviewPanel } from "./ReviewPanel";
import { actionPermissions, type ManualExecutionScope, type RankCheckQuote, type ReportWorkbench, type WorkbenchAction, type WorkbenchOperations } from "./types";
import { formatFixed, formatPercent } from "./fixed-decimal";

export function ActionDrawer({
  data,
  action,
  viewerUserId,
  operations,
  onClose,
}: {
  data: ReportWorkbench;
  action: WorkbenchAction;
  viewerUserId: string;
  operations: WorkbenchOperations;
  onClose: () => void;
}) {
  const permissions = actionPermissions(data, action, viewerUserId);
  const owner = action.ownerUserId === viewerUserId;
  const report = data.report;
  const amountsBlocked = shouldMaskWorkbenchAmounts(data);
  const amount = (value: string | null) => amountsBlocked ? "待补口径" : value === null ? "不可计算" : `${report.currency} ${formatFixed(value)}`;
  const plannedAmount = (value: string | null) => amountsBlocked ? "待补口径" : value === null ? "待量化" : `${report.currency} ${formatFixed(value)}`;
  const acos = (value: string | null) => amountsBlocked ? "待补口径" : value === null ? "不可计算" : `${formatPercent(value)}%`;
  const planned = action.actionCategory === "增量放大" ? action.plannedUpAmount
    : action.actionCategory === "止损整改" || action.actionCategory === "降投保护" ? action.plannedDownAmount
      : action.actionCategory === "待测试" ? action.suggestedBudgetOrTestCap : null;
  const [assigning, setAssigning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [scopeForm, setScopeForm] = useState(false);
  const [scopeFields, setScopeFields] = useState({
    campaignId: "", adGroupId: "", targetId: "", targetType: "",
    matchType: "", searchTerm: "", targetExpression: "", sourceLocator: "",
  });
  const [cancelForm, setCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rankQuote, setRankQuote] = useState<RankCheckQuote | null>(null);
  const [rankQuotePending, setRankQuotePending] = useState(false);
  const [rankQuoteError, setRankQuoteError] = useState(false);
  const [rankObservationDate, setRankObservationDate] = useState("");
  const updateScope = (field: keyof typeof scopeFields, value: string) => {
    setScopeFields((current) => ({ ...current, [field]: value }));
  };
  const targetLocatorReady = scopeFields.targetExpression.trim() !== ""
    || (scopeFields.matchType.trim() !== "" && scopeFields.searchTerm.trim() !== "");
  const requiredScopeReady = targetLocatorReady
    && [scopeFields.campaignId, scopeFields.adGroupId, scopeFields.targetId,
      scopeFields.targetType, scopeFields.sourceLocator].every((value) => value.trim() !== "");
  const submitScope = () => {
    if (!requiredScopeReady) return;
    const confirmed: ManualExecutionScope = {
      campaignId: scopeFields.campaignId.trim(),
      adGroupId: scopeFields.adGroupId.trim(),
      targetId: scopeFields.targetId.trim(),
      targetType: scopeFields.targetType.trim(),
      matchType: scopeFields.matchType.trim() || null,
      searchTerm: scopeFields.searchTerm.trim() || null,
      targetExpression: scopeFields.targetExpression.trim() || null,
      sourceLocator: scopeFields.sourceLocator.trim(),
    };
    operations.confirmScope(action, confirmed);
  };

  return (
    <div className="drawer-backdrop">
      <aside className="action-drawer" role="dialog" aria-modal="true" aria-label="动作证据详情">
        <header className="drawer-header"><div><ActionLabel category={action.actionCategory} /><h2>{action.keyword}</h2></div><button type="button" onClick={onClose} aria-label="关闭动作详情">×</button></header>
        <section><h3>定位与不可变证据</h3>
          <dl className="detail-grid">
            <div><dt>Campaign</dt><dd>{action.campaignName ?? "—"}</dd></div><div><dt>Campaign ID</dt><dd>{action.campaignId ?? "—"}</dd></div>
            <div><dt>广告组</dt><dd>{action.adGroupName ?? "—"}</dd></div><div><dt>Ad Group ID</dt><dd>{action.adGroupId ?? "—"}</dd></div>
            <div><dt>Target / Keyword ID</dt><dd>{action.targetId ?? "—"}</dd></div><div><dt>匹配方式</dt><dd>{action.matchType ?? "—"}</dd></div>
            <div><dt>执行作用域</dt><dd>{action.executionScopeStatus}</dd></div><div><dt>Owner</dt><dd>{action.ownerDisplayName ?? action.externalOwnerName ?? "未分配"}</dd></div>
            <div><dt>计划执行日</dt><dd>{action.plannedExecutionDate ?? "—"}</dd></div><div><dt>实际执行时间</dt><dd>{action.executedAt ?? "—"}</dd></div>
            <div><dt>复盘截止时间</dt><dd>{action.reviewDueAt ?? "—"}</dd></div><div><dt>当前状态</dt><dd>{action.actionStatus}{action.actionBlocker ? ` · ${action.actionBlocker}` : ""}</dd></div>
            <div><dt>实际出价</dt><dd>{amount(action.actualBid)}</dd></div><div><dt>实际预算</dt><dd>{amount(action.actualBudget)}</dd></div>
            <div><dt>实际否定动作</dt><dd>{action.actualNegativeAction ?? "—"}</dd></div>
            <div><dt>当前花费 / 销售</dt><dd>{amount(action.currentSpend)} / {amount(action.currentSales)}</dd></div>
            <div><dt>当前 ACOS / 目标 ACOS</dt><dd>{acos(action.currentAcos)} / {acos(report.targetAcos)}</dd></div>
            <div><dt>风险花费</dt><dd>{amount(action.riskSpend)}</dd></div>
            <div><dt>当前出价 → 建议出价 / 测试上限</dt><dd>{amount(action.currentBid)} → {action.suggestedBidLow && action.suggestedBidHigh ? `${amount(action.suggestedBidLow)}–${amount(action.suggestedBidHigh)}` : "不可计算"}{action.suggestedBudgetOrTestCap ? ` / ${amount(action.suggestedBudgetOrTestCap)}` : ""}</dd></div>
            <div><dt>动作规划金额</dt><dd>{plannedAmount(planned)}</dd></div>
          </dl>
          <p>{action.reason ?? "无量化理由"}</p><ul>{action.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          <p><strong>护栏：</strong>{action.guardrail ?? "—"}</p>
        </section>
        <section><h3>竞品与 13 周趋势</h3>
          <ul>{action.competitorDetails.map((item) => <li key={item.asin}><strong>{item.asin}</strong>{item.clickShare ? ` · 点击份额 ${item.clickShare}` : ""}{item.note ? ` · ${item.note}` : ""}</li>)}</ul>
          <ul>{action.trend13Weeks.map((point) => <li key={point.week}>{point.week}：{point.demand}</li>)}</ul>
        </section>
        <section><h3>历史自然位趋势</h3><p>XYDC / US / 历史日级趋势。请选择需要复查的单日历史日期。</p>
          <p>供应商日级数据支持 ABA 前 200 万关键词；具体词与日期的数据可用性以供应商为准</p>
          <p>日级口径待供应商确认，暂不作为执行后双次跌出前 10 的正式预警证据。</p>
          {action.rankDoubleDropAlert ? <p className="warning-notice">自然位两次跌出前 10，停止继续降投并复核。</p> : null}
          {action.rankChecks.length > 0 ? <ul>{action.rankChecks.map((check) => <li key={check.observationId ?? `${check.checkedAt}-${check.standardVersion ?? "legacy"}`}>
            {check.observationDate ? `${check.availability === 'unverified' ? '查询日期' : '历史日期'} ${check.observationDate} · ` : "旧版记录 · "}{check.environmentLabel} · {check.availability === 'unverified' ? '尚无可验证排名' : check.availability === 'no_data' ? '该日未返回排名数据，覆盖情况待确认'
              : check.availability === 'unranked' ? '当日未返回自然位名次' : check.naturalRank === null ? "自然位未上榜" : `自然位第 ${check.naturalRank} 名`}
            {check.billingState ? ` · ${check.billingState}` : ""}{check.completedEvidence ? " · 已完成证据" : ""}
          </li>)}</ul> : null}
          {permissions.canRequestRankCheck && !rankQuote ? <div className="inline-operation"><label>历史日期<input aria-label="历史趋势日期" type="date" value={rankObservationDate} onChange={(event) => setRankObservationDate(event.target.value)} /></label><button type="button" disabled={rankQuotePending || !rankObservationDate} onClick={() => {
            setRankQuotePending(true); setRankQuoteError(false);
            void operations.quoteRankCheck(action, rankObservationDate).then(setRankQuote, () => setRankQuoteError(true)).finally(() => setRankQuotePending(false));
          }}>创建历史趋势报价</button></div> : null}
          {rankQuote ? <div className="inline-operation"><p>服务：{rankQuote.environmentLabel}</p><p>历史日期：{rankQuote.observationDate}</p><p>单日最多 1 Credit；账单核对与排名证据资格分开记录。</p>
            <button type="button" onClick={() => operations.confirmRankCheck(action, rankQuote)}>确认费用并发起历史趋势查询</button></div> : null}
          {rankQuoteError ? (
            <p role="alert">报价状态未确认；请重试，系统将复用同一请求，不会重复授权费用。</p>
          ) : null}
        </section>
        <section><h3>来源与允许展示的操作历史</h3><ul>{action.dataSources.map((source) => <li key={source}>{source}</li>)}</ul>
          <ol>{action.events.map((event) => <li key={`${event.occurredAt}-${event.eventType}`}><strong>{event.eventType}</strong> · {event.occurredAt}{event.actorDisplayName ? ` · ${event.actorDisplayName}` : ""}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ol>
        </section>
        <div className="drawer-actions">
          {permissions.canAssignOwner ? <button type="button" onClick={() => setAssigning(true)}>分配 Owner</button> : null}
          {owner && action.actionStatus === "待执行" && action.executionRequirement !== "none"
            ? <button type="button" disabled={!permissions.canExecute} onClick={() => setExecuting(true)}>标记已执行</button> : null}
          {permissions.canConfirmScope ? <button type="button" onClick={() => setScopeForm(true)}>确认手工作用域</button> : null}
          {permissions.canRequestCancel ? <button type="button" onClick={() => setCancelForm(true)}>申请取消</button> : null}
          {permissions.canConfirmCancel ? <button type="button" onClick={() => operations.confirmCancel(action)}>确认取消</button> : null}
          {permissions.canClose ? <button type="button" onClick={() => operations.close(action)}>关闭动作</button> : null}
        </div>
        {scopeForm ? <section className="inline-operation scope-locator-form">
          <label>Campaign ID<input value={scopeFields.campaignId} onChange={(event) => updateScope("campaignId", event.target.value)} /></label>
          <label>Ad Group ID<input value={scopeFields.adGroupId} onChange={(event) => updateScope("adGroupId", event.target.value)} /></label>
          <label>Target ID<input value={scopeFields.targetId} onChange={(event) => updateScope("targetId", event.target.value)} /></label>
          <label>Target Type<input value={scopeFields.targetType} onChange={(event) => updateScope("targetType", event.target.value)} /></label>
          <label>Match Type<input value={scopeFields.matchType} onChange={(event) => updateScope("matchType", event.target.value)} /></label>
          <label>Search Term<input value={scopeFields.searchTerm} onChange={(event) => updateScope("searchTerm", event.target.value)} /></label>
          <label>Target Expression<input value={scopeFields.targetExpression} onChange={(event) => updateScope("targetExpression", event.target.value)} /></label>
          <label>Source Locator<input value={scopeFields.sourceLocator} onChange={(event) => updateScope("sourceLocator", event.target.value)} /></label>
          <button type="button" disabled={!requiredScopeReady} onClick={submitScope}>提交作用域确认</button>
        </section> : null}
        {cancelForm ? <section className="inline-operation"><label>取消原因<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label><button type="button" disabled={!cancelReason.trim()} onClick={() => operations.requestCancel(action, cancelReason.trim())}>提交取消申请</button></section> : null}
        {permissions.canViewReview ? <ReviewPanel action={action} canUpload={permissions.canUploadReview} canSubmit={permissions.canSubmitReview}
          onSubmit={(result) => operations.submitReview(action, result)}
          onPreflightDataset={(role, file) => operations.preflightReviewDataset(action, role, file)} /> : null}
      </aside>
      {assigning ? <OwnerDialog members={data.report.workspaceMembers} initialOwnerUserId={action.ownerUserId} initialDate={action.plannedExecutionDate}
        onCancel={() => setAssigning(false)} onAssign={(ownerUserId, date) => operations.assignOwner(action, ownerUserId, date)} /> : null}
      {executing ? <ExecutionDialog action={action} onCancel={() => setExecuting(false)} onExecute={(values) => operations.execute(action, values)} /> : null}
    </div>
  );
}
