import { ACTION_CATEGORIES, type ReportWorkbench, type WorkbenchFilter } from "./types";
import { shouldMaskWorkbenchAmounts } from "./contract";
import { compareFixed, formatFixed, positiveFixed } from "./fixed-decimal";

function money(currency: string, value: string | null) {
  const formatted = formatFixed(value);
  return formatted === null ? "不可计算" : `${currency} ${formatted}`;
}

export function Dashboard({
  workbench,
  activeFilter,
  onFilterChange,
}: {
  workbench: ReportWorkbench;
  activeFilter: WorkbenchFilter;
  onFilterChange: (filter: WorkbenchFilter) => void;
}) {
  const { report } = workbench;
  const evidenceRows = [...new Map(workbench.actions.map((item) => [item.reportRowId, item])).values()];
  const blocked = shouldMaskWorkbenchAmounts(workbench);
  const amount = (value: string | null) => blocked ? "待补口径" : money(report.currency, value);
  const counts = Object.fromEntries(ACTION_CATEGORIES.map((category) => [
    category,
    evidenceRows.filter((item) => item.actionCategory === category).length,
  ]));
  const incrementals = evidenceRows.filter((item) => item.actionCategory === "增量放大"
    && item.sampleSufficient
    && (item.currentClicks ?? 0) >= 20 && (item.currentOrders ?? 0) >= 2
    && positiveFixed(item.currentSpend) && positiveFixed(item.currentSales) && positiveFixed(item.currentAcos)
    && item.currentAvgCpc !== null && positiveFixed(item.plannedUpAmount) && item.estimatedIncrementalSales !== null)
    .sort((a, b) => compareFixed(b.estimatedIncrementalSales, a.estimatedIncrementalSales))
    .slice(0, 5);
  const stopLoss = evidenceRows.filter((item) => item.actionCategory === "止损整改" || item.actionCategory === "降投保护")
    .filter((item) => item.riskSpend !== null)
    .sort((a, b) => compareFixed(b.riskSpend, a.riskSpend))
    .slice(0, 5);
  const tests = evidenceRows.filter((item) => item.actionCategory === "待测试");
  const metrics = [
    ["规划增投额", report.metrics.plannedUpAmount, true, "增量放大"],
    ["规划降投额", report.metrics.plannedDownAmount, true, "stop-loss"],
    ["当前花费", report.metrics.currentSpend, false, "all"],
    ["当前销售额", report.metrics.currentSales, false, "all"],
    ["风险花费", report.metrics.riskSpend, true, "stop-loss"],
  ] as const;

  return (
    <section className="dashboard" aria-label="经营驾驶舱">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Layer 1</p>
          <h2>经营驾驶舱</h2>
        </div>
        <p className="planning-label">规划估算</p>
      </div>
      {blocked ? <p className="error-notice dashboard-blocker" role="alert">待补口径：经营与规划金额暂不展示，证据和筛选仍可使用。</p> : null}
      <div className="action-counts" aria-label="动作分类筛选">
        {ACTION_CATEGORIES.map((category) => (
          <button key={category} type="button" className={activeFilter === category ? "filter-active" : ""}
            aria-label={`筛选${category}`} onClick={() => onFilterChange(category)}>
            <strong>{category}</strong><span>{counts[category]} 个</span>
          </button>
        ))}
        <button type="button" onClick={() => onFilterChange("all")} aria-label="清除动作筛选">全部动作</button>
      </div>
      <div className="metric-grid">
        {metrics.map(([label, value, projected, filter]) => (
          <article className="metric-card" key={label}>
            <button type="button" onClick={() => onFilterChange(filter)}>
              <span>{label}</span><strong>{amount(value)}</strong>{projected ? <small>规划估算</small> : null}
            </button>
          </article>
        ))}
      </div>
      <div className="ranking-grid">
        <article className="ranking-card" data-testid="top-incremental">
          <h3>Top 5 增量机会</h3>
          {incrementals.length ? <ol>{incrementals.map((item) => (
            <li key={item.reportRowId}>
              <button type="button" onClick={() => onFilterChange("增量放大")}>{item.keyword}</button>
              <span>{blocked ? "待补口径" : `规划估算 · 预计增量销售 ${money(report.currency, item.estimatedIncrementalSales)}；增投 ${money(report.currency, item.plannedUpAmount)}`}</span>
            </li>
          ))}</ol> : <p>暂无满足样本阈值的机会。</p>}
        </article>
        <article className="ranking-card" data-testid="top-stop-loss">
          <h3>Top 5 止损项</h3>
          {stopLoss.length ? <ol>{stopLoss.map((item) => (
            <li key={item.reportRowId}>
              <button type="button" onClick={() => onFilterChange("stop-loss")}>{item.keyword}</button>
              <span>{blocked ? "待补口径" : `规划估算 · 风险 ${money(report.currency, item.riskSpend)}`}</span>
            </li>
          ))}</ol> : <p>暂无可计算的风险项。</p>}
        </article>
        <article className="ranking-card" data-testid="test-summary">
          <h3>待测试摘要</h3>
          <p>{tests.length} 个待测试词</p>
          <p>{blocked ? "测试预算 待补口径" : `规划估算 · 测试预算 ${money(report.currency, report.metrics.testBudget)} / 验证 ${report.testValidationDays} 天`}</p>
          <small>仅展示测试预算和验证周期，不预测销售额。</small>
        </article>
      </div>
    </section>
  );
}
