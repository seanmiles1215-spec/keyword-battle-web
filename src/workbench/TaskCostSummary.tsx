import type { TaskCostSummaryData } from './types';

export function TaskCostSummary({ summary }: { summary: TaskCostSummaryData }) {
  const pending = summary.providers.some(p => p.pendingCount > 0 || p.uncertainCount > 0);
  return <section className="report-context" aria-label="任务费用">
    <h2>任务费用</h2><p>任务状态：{summary.taskStatus}</p>
    {pending ? <p role="status">账单待核对，当前实扣不是最终总额</p> : null}
    {summary.providers.some(p => p.overCap) ? <p role="alert">费用超额，已停止后续调用与发布</p> : null}
    {summary.providers.map(p => <article key={p.provider}>
      <h3>{p.provider} · {p.currencyOrUnit}</h3>
      <dl>
        <dt>预估费用</dt><dd>{p.estimatedCost === null ? '未提供' : `${p.currencyOrUnit} ${p.estimatedCost}`}</dd>
        <dt>锁定上限</dt><dd>{p.currencyOrUnit} {p.lockedCap}</dd>
        <dt>已核实实扣</dt><dd>{p.currencyOrUnit} {p.confirmedActual}</dd>
        <dt>待核对占用</dt><dd>{p.currencyOrUnit} {p.unresolvedReserved}</dd>
      </dl>
      <p>待核对账单 {p.pendingCount} 项 · 调用结果不确定 {p.uncertainCount} 项</p>
    </article>)}
  </section>;
}
