import { ChangeEvent, useState } from "react";

import type { WorkbenchAction } from "./types";
import { formatPercent, improvementPercent, percentagePointChange } from "./fixed-decimal";

export function ReviewPanel({
  action,
  canUpload = true,
  canSubmit,
  onSubmit,
  onPreflightDataset,
}: {
  action: WorkbenchAction;
  canUpload?: boolean;
  canSubmit: boolean;
  onSubmit: (reviewResult: string) => void;
  onPreflightDataset: (role: "执行前基准" | "执行后结果", file: File) => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [reviewResult, setReviewResult] = useState(action.reviewResult ?? "复盘数据已核验");
  const { review } = action;
  const before = formatPercent(review.beforeAcos);
  const after = formatPercent(review.afterAcos);
  const mathValid = before !== null && after !== null;
  const pointChange = percentagePointChange(review.beforeAcos, review.afterAcos);
  const improvement = improvementPercent(review.beforeAcos, review.afterAcos);
  const submitReady = canSubmit && review.comparable && review.maturityStatus === "已成熟"
    && review.reviewStatus === "可提交" && reviewResult.trim() !== "";

  function file(role: "执行前基准" | "执行后结果", event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) onPreflightDataset(role, selected);
  }

  return (
    <section className="review-panel" aria-labelledby="review-title">
      <div className="section-heading"><h3 id="review-title">复盘闭环</h3><span>{review.reviewStatus ?? "待补数据"}</span></div>
      {canUpload ? <button type="button" onClick={() => setShowUpload((value) => !value)}>上传复盘报表</button> : null}
      {showUpload ? <div className="review-upload-grid">
        <label>执行前基准报表<input type="file" accept=".xlsx,.csv" onChange={(event) => file("执行前基准", event)} /></label>
        <label>执行后结果报表<input type="file" accept=".xlsx,.csv" onChange={(event) => file("执行后结果", event)} /></label>
        <p>文件先进入受控上传 session 与免费 Preflight；比较通过后才能确认数据集。</p>
      </div> : null}
      {review.blockers.length ? <div className="blockers" role="alert"><strong>{review.maturityStatus ?? "复盘阻塞"}</strong><ul>{review.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}
      <div className="review-window-grid">
        <p>D-7..D-1：{review.beforePeriodStart ?? "待补"} 至 {review.beforePeriodEnd ?? "待补"}</p>
        <p>D+1..D+7：{review.afterPeriodStart ?? "待补"} 至 {review.afterPeriodEnd ?? "待补"}</p>
      </div>
      <div className="review-metrics">
        <span>执行前 ACOS {before === null ? "—" : `${before}%`}</span>
        <span>执行后 ACOS {after === null ? "—" : `${after}%`}</span>
        {mathValid && pointChange !== null ? <span>百分点变化 {pointChange} pp</span> : null}
        {improvement !== null ? <span>改善率 {improvement}%</span> : null}
      </div>
      {canSubmit ? <><label>复盘结论<textarea value={reviewResult} onChange={(event) => setReviewResult(event.target.value)} /></label>
        <button className="primary" type="button" disabled={!submitReady} onClick={() => onSubmit(reviewResult.trim())}>提交复盘</button></> : null}
    </section>
  );
}
