import { FormEvent, useState } from "react";

import type { ExecutionValues, WorkbenchAction } from "./types";
import { positiveFixed } from "./fixed-decimal";

const FIELD = {
  actual_bid: { label: "实际出价", placeholder: "例如 2.75" },
  actual_budget: { label: "实际预算", placeholder: "例如 20.00" },
  actual_negative_action: { label: "实际否定动作", placeholder: "例如 否定精准 carplay box" },
  none: { label: "", placeholder: "" },
} as const;

function valid(requirement: WorkbenchAction["executionRequirement"], value: string) {
  if (requirement === "actual_negative_action") return value.trim().length > 0;
  if (requirement === "actual_bid" || requirement === "actual_budget") {
    return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(value.trim()) && positiveFixed(value.trim());
  }
  return false;
}

export function ExecutionDialog({
  action,
  onCancel,
  onExecute,
}: {
  action: WorkbenchAction;
  onCancel: () => void;
  onExecute: (values: ExecutionValues) => void;
}) {
  const [value, setValue] = useState("");
  const field = FIELD[action.executionRequirement];
  const canSubmit = valid(action.executionRequirement, value);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onExecute({
      actualBid: action.executionRequirement === "actual_bid" ? value.trim() : null,
      actualBudget: action.executionRequirement === "actual_budget" ? value.trim() : null,
      actualNegativeAction: action.executionRequirement === "actual_negative_action" ? value.trim() : null,
    });
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" role="dialog" aria-modal="true" aria-label="登记实际执行" onSubmit={submit}>
        <h2>登记实际执行</h2>
        <p>{action.keyword} · <strong>{action.actionCategory}</strong></p>
        <label>{field.label}
          <input aria-label={field.label} value={value} placeholder={field.placeholder} inputMode={action.executionRequirement === "actual_negative_action" ? "text" : "decimal"}
            onChange={(event) => setValue(event.target.value)} />
        </label>
        <p className="form-help">仅提交本动作要求的实际字段；其他字段固定为空。</p>
        <div className="button-row"><button type="button" onClick={onCancel}>取消</button><button className="primary" type="submit" disabled={!canSubmit}>确认执行</button></div>
      </form>
    </div>
  );
}
