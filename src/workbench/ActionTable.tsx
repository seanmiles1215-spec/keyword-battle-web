import { actionMatchesFilter, type ActionCategory, type WorkbenchAction, type WorkbenchFilter } from "./types";
import { formatFixed, formatPercent } from "./fixed-decimal";

const ICONS: Record<ActionCategory, string> = {
  "止损整改": "🛑",
  "增量放大": "↗",
  "待测试": "🧪",
  "降投保护": "🛡",
  "暂不处理": "⏸",
};

export function ActionLabel({ category }: { category: ActionCategory | null }) {
  return category ? <span className="action-label"><span aria-hidden="true">{ICONS[category]}</span> {category}</span> : <span>待补口径</span>;
}

function value(value: string | number | null) {
  return value === null ? "—" : String(value);
}

function bidPlan(action: WorkbenchAction, amountsBlocked: boolean) {
  if (amountsBlocked) return "待补口径";
  const suggestion = action.suggestedBidLow && action.suggestedBidHigh
    ? `${action.suggestedBidLow}–${action.suggestedBidHigh}` : "待量化";
  return `${value(action.currentBid)} → ${suggestion}`;
}

function money(currency: string, amount: string | null, blocked: boolean) {
  if (blocked) return "待补口径";
  const value = formatFixed(amount);
  return value === null ? "不可计算" : `${currency} ${value}`;
}

function plannedMoney(currency: string, amount: string | null, blocked: boolean) {
  return blocked ? "待补口径" : amount === null ? "待量化" : money(currency, amount, false);
}

function ratio(value: string | null, blocked: boolean) {
  if (blocked) return "待补口径";
  const formatted = formatPercent(value);
  return formatted === null ? "不可计算" : `${formatted}%`;
}

function plannedAmount(action: WorkbenchAction) {
  if (action.actionCategory === "增量放大") return action.plannedUpAmount;
  if (action.actionCategory === "止损整改" || action.actionCategory === "降投保护") return action.plannedDownAmount;
  if (action.actionCategory === "待测试") return action.suggestedBudgetOrTestCap;
  return null;
}

export function ActionTable({
  actions,
  filter,
  amountsBlocked,
  currency,
  targetAcos,
  onOpen,
}: {
  actions: WorkbenchAction[];
  filter: WorkbenchFilter;
  amountsBlocked: boolean;
  currency: string;
  targetAcos: string | null;
  onOpen: (action: WorkbenchAction) => void;
}) {
  const visible = actions.filter((action) => actionMatchesFilter(action, filter));
  return (
    <section className="action-workbench" aria-labelledby="action-workbench-title">
      <div className="section-heading">
        <div><p className="eyebrow">Layer 2</p><h2 id="action-workbench-title">执行作战表</h2></div>
        <p>{visible.length} 个执行对象</p>
      </div>
      <div className="table-scroller">
        <table className="desktop-action-table" aria-label="桌面执行作战表">
          <thead><tr><th>关键词</th><th>动作</th><th>花费 / 销售</th><th>ACOS / 目标</th><th>风险花费</th><th>当前出价 → 建议出价 / 测试上限</th><th>规划金额</th><th>理由 / 护栏</th><th>Owner</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>{visible.map((action) => (
            <tr key={action.actionItemId}>
              <th scope="row">{action.keyword}</th>
              <td><ActionLabel category={action.actionCategory} /></td>
              <td>{money(currency, action.currentSpend, amountsBlocked)} / {money(currency, action.currentSales, amountsBlocked)}</td>
              <td>{ratio(action.currentAcos, amountsBlocked)} / {ratio(targetAcos, amountsBlocked)}</td>
              <td>{money(currency, action.riskSpend, amountsBlocked)}</td>
              <td>{bidPlan(action, amountsBlocked)}{action.suggestedBudgetOrTestCap ? ` / ${money(currency, action.suggestedBudgetOrTestCap, amountsBlocked)}` : ""}</td>
              <td><span className="planning-inline">规划估算</span> {plannedMoney(currency, plannedAmount(action), amountsBlocked)}</td>
              <td>{action.reason ?? "—"}<small>{action.guardrail ?? "—"}</small></td>
              <td>{action.ownerDisplayName ?? action.externalOwnerName ?? "未分配"}{action.externalOwnerName ? <small>外部姓名仅展示</small> : null}</td>
              <td>{action.actionStatus}{action.actionBlocker ? <small>{action.actionBlocker}</small> : null}</td>
              <td><button type="button" onClick={() => onOpen(action)} aria-label={`查看 ${action.keyword} 详情`}>查看详情</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <ul className="mobile-action-cards" aria-label="移动执行作战表">
        {visible.map((action) => (
          <li key={action.actionItemId}>
            <div><strong>{action.keyword}</strong><ActionLabel category={action.actionCategory} /></div>
            <p>花费 {money(currency, action.currentSpend, amountsBlocked)} / 销售 {money(currency, action.currentSales, amountsBlocked)}</p>
            <p>ACOS {ratio(action.currentAcos, amountsBlocked)} / 目标 ACOS {ratio(targetAcos, amountsBlocked)}</p>
            <p>风险花费 {money(currency, action.riskSpend, amountsBlocked)}</p>
            <p><span className="planning-inline">规划估算</span> 当前出价 → 建议出价 / 测试上限：{bidPlan(action, amountsBlocked)}{action.suggestedBudgetOrTestCap ? ` / ${money(currency, action.suggestedBudgetOrTestCap, amountsBlocked)}` : ""}</p>
            <p><span className="planning-inline">规划估算</span> {plannedMoney(currency, plannedAmount(action), amountsBlocked)}</p>
            <p>{action.reason ?? "—"}</p>
            <p>Owner：{action.ownerDisplayName ?? action.externalOwnerName ?? "未分配"} · {action.actionStatus}</p>
            <button type="button" onClick={() => onOpen(action)} aria-label={`查看 ${action.keyword} 详情`}>查看详情</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
