import type { PreflightFeeDialog } from "../lib/api";
import { getConfirmableFeeQuote, isFeeQuoteExpired, type FeeQuoteUiState } from "./fee-quote-state";
import type { ConfirmationParameters } from "./parameter-lock";

export interface CostConfirmationDialogProps {
  preflight: PreflightFeeDialog;
  feeQuoteState: FeeQuoteUiState;
  expiresAt: string;
  parameters: ConfirmationParameters;
  parametersComplete: boolean;
  preflightHash: string | null;
  lockedParameters: Readonly<ConfirmationParameters> | null;
  applyingParameters: boolean;
  confirmationLocked: boolean;
  confirmationOutcomeUnknown: boolean;
  queued: boolean;
  onParameterChange: (field: keyof ConfirmationParameters, value: string) => void;
  onAttributionGroupChange: (groupId: string) => void;
  onApplyParameters: () => void;
  onEditParameters: () => void;
  onRefreshQuote: () => void;
  onRetryQuote: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function periodLabel(preflight: PreflightFeeDialog) {
  return preflight.periodStart && preflight.periodEnd && preflight.periodDays
    ? `${preflight.periodStart} 至 ${preflight.periodEnd}（${preflight.periodDays} 天）`
    : "待补报告周期";
}

function attributionLabel(preflight: PreflightFeeDialog) {
  if (preflight.attributionMetricGroups.length > 1) {
    return `${preflight.attributionMetricGroups.length} 个候选，需明确选择`;
  }
  const group = preflight.attributionMetricGroups[0];
  return group ? `${group.days} 天 / ${group.fieldGroup}` : "待确认归因天数与字段组";
}

function unavailableReasonLabel(code: string) {
  if (code === "PARAMETERS_REQUIRED") return "暂无法提供可信费用报价：请先锁定分析口径。";
  if (code === "PRICING_UNAVAILABLE") return "暂无法提供可信费用报价：当前没有可用的豆包价格配置；不能按零费用继续。";
  if (code === "PRICING_EXPIRED") return "暂无法提供可信费用报价：可信价格配置已过期。";
  if (code === "SOURCE_EXPIRED") return "暂无法提供可信费用报价：上传源已过期，请重新上传。";
  return "暂无法提供可信费用报价：当前价格配置不受支持。";
}

function quoteIsExpired(state: FeeQuoteUiState) {
  return state.status === "expired"
    || (state.status === "ready" && isFeeQuoteExpired(state.quote));
}

function currentReadyQuote(state: FeeQuoteUiState) {
  return state.status === "ready" && !quoteIsExpired(state) && state.quote.current !== false
    ? state.quote
    : null;
}

export function CostConfirmationDialog(props: CostConfirmationDialogProps) {
  const {
    preflight,
    feeQuoteState,
    expiresAt,
    parameters,
    parametersComplete,
    preflightHash,
    lockedParameters,
    applyingParameters,
    confirmationLocked,
    confirmationOutcomeUnknown,
    queued,
    onParameterChange,
    onAttributionGroupChange,
    onApplyParameters,
    onEditParameters,
    onRefreshQuote,
    onRetryQuote,
    onConfirm,
    onCancel,
  } = props;
  const isV2 = preflight.responseSchemaVersion === "preflight-fee-dialog-v2";
  const statusClass = preflight.preflightStatus === "可确认" ? "status-ok" : "status-warn";
  const quote = currentReadyQuote(feeQuoteState);
  const replayQuote = confirmationOutcomeUnknown ? getConfirmableFeeQuote(feeQuoteState, true) : null;
  const displayedQuote = replayQuote ?? quote;
  const expired = quoteIsExpired(feeQuoteState);
  const quoteBusy = feeQuoteState.status === "loading";
  const quoteRetrySameRequest = feeQuoteState.status === "outcome-unknown";
  const canConfirmQuote = isV2 && (quote !== null || replayQuote !== null);

  return (
    <section className="confirmation-card" aria-labelledby="fee-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">免费预检完成</p>
          <h2 id="fee-title">费用与口径确认</h2>
        </div>
        <span className={statusClass}>{preflight.preflightStatus}</span>
      </div>

      <dl className="fee-grid">
        {isV2 ? (
          <>
            <div><dt>经营数据币种</dt><dd>USD（仅业务数据）</dd></div>
            <div><dt>预估西柚费用</dt><dd>{displayedQuote?.providers[1].estimatedCost ?? "暂不可确认"}{displayedQuote ? " credits" : ""}</dd></div>
            <div><dt>预估豆包费用</dt><dd>{displayedQuote?.providers[0].estimatedCost ?? "暂不可确认"}{displayedQuote ? " CNY" : ""}</dd></div>
          </>
        ) : (
          <>
            <div><dt>预计西柚积分（旧版）</dt><dd>{preflight.estimatedXiyouCredits} credits</dd></div>
            <div><dt>预计豆包费用（旧版）</dt><dd>{preflight.estimatedDoubaoCost} USD</dd></div>
          </>
        )}
        <div><dt>数据周期</dt><dd>{periodLabel(preflight)}</dd></div>
        <div><dt>固定环境</dt><dd>US / USD / America/Los_Angeles</dd></div>
        <div><dt>归因口径</dt><dd>{attributionLabel(preflight)}</dd></div>
        <div>
          <dt>费用依据</dt>
          <dd>{`${preflight.calculationBasis.keywordCount} 个关键词；解析器 ${preflight.calculationBasis.parserVersion}${"pricingVersion" in preflight.calculationBasis ? `；历史计价 ${preflight.calculationBasis.pricingVersion}` : ""}`}</dd>
        </div>
      </dl>

      {isV2 ? (
        <div className="quote-status" role={feeQuoteState.status === "unavailable" || feeQuoteState.status === "error" ? "alert" : "status"}>
          {feeQuoteState.status === "loading" ? <span>正在获取并保存可信费用报价…</span> : null}
          {feeQuoteState.status === "unavailable" ? <span>{unavailableReasonLabel(feeQuoteState.quote.reasonCode)}</span> : null}
          {feeQuoteState.status === "outcome-unknown" ? <span>报价保存结果待核对；只能用同一请求重试，不会自动创建第二份报价。</span> : null}
          {feeQuoteState.status === "error" ? <span>{feeQuoteState.message}</span> : null}
          {feeQuoteState.status === "expired" || expired ? <span>报价已过期，请刷新报价并重新确认。</span> : null}
          {feeQuoteState.status === "ready" && feeQuoteState.quote.current === false
            ? <span>此报价已被更新报价替代，请刷新后使用当前报价。</span> : null}
          {feeQuoteState.status === "ready" && !expired && feeQuoteState.quote.current !== false ? (
            <span><time dateTime={feeQuoteState.quote.expiresAt}>报价有效至 {feeQuoteState.quote.expiresAt}</time></span>
          ) : null}
        </div>
      ) : (
        <p className="notice" role="note">此为旧版预检记录，仅供查看；新任务必须使用新版 CNY 报价，不能按旧 USD 费用再次确认。</p>
      )}

      <p className="expiry"><time dateTime={expiresAt}>临时上传到期：{expiresAt}（24 小时）</time></p>

      {preflight.preflightBlockers.length > 0 ? (
        <div className="blockers" role="alert">
          <strong>费用确认前必须补齐：</strong>
          <ul>{preflight.preflightBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        </div>
      ) : null}

      {lockedParameters ? (
        <section className="locked-parameters" aria-label="已锁定分析口径">
          <h3>已锁定分析口径</h3>
          <dl className="fee-grid">
            <div><dt>周期</dt><dd>{lockedParameters.periodStart} 至 {lockedParameters.periodEnd}</dd></div>
            <div><dt>报告类型</dt><dd>{lockedParameters.reportType}</dd></div>
            <div><dt>归因</dt><dd>{lockedParameters.attributionDays} 天 / {lockedParameters.attributionMetricGroup}</dd></div>
            <div><dt>target_acos</dt><dd>{lockedParameters.targetAcos}</dd></div>
          </dl>
          <button type="button" disabled={confirmationLocked || queued || quoteBusy || !isV2} onClick={onEditParameters}>修改分析口径</button>
        </section>
      ) : (
        <fieldset disabled={applyingParameters || !isV2}>
          <legend>分析口径</legend>
          <div className="form-grid">
            <label>
              周期开始
              <input type="date" value={parameters.periodStart} onChange={(event) => onParameterChange("periodStart", event.target.value)} />
            </label>
            <label>
              周期结束
              <input type="date" value={parameters.periodEnd} onChange={(event) => onParameterChange("periodEnd", event.target.value)} />
            </label>
            <label>
              报告类型
              <input value={parameters.reportType} readOnly aria-readonly="true" />
            </label>
            <label>
              归因字段组
              <select value={parameters.attributionMetricGroup} onChange={(event) => onAttributionGroupChange(event.target.value)}>
                <option value="">请选择归因字段组</option>
                {preflight.attributionMetricGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.days} 天 / {group.fieldGroup}（{group.id}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              归因天数
              <input type="number" value={parameters.attributionDays} readOnly />
            </label>
            <label>
              target_acos（0–1）
              <input inputMode="decimal" value={parameters.targetAcos} onChange={(event) => onParameterChange("targetAcos", event.target.value)} />
            </label>
          </div>
        </fieldset>
      )}

      <div className="caps" aria-label="锁定费用上限">
        {isV2 ? (
          <>
            <span>西柚确认上限：{displayedQuote?.providers[1].lockedCap ?? "尚未可确认"}{displayedQuote ? " credits" : ""}</span>
            <span>豆包确认上限：{displayedQuote?.providers[0].lockedCap ?? "尚未可确认"}{displayedQuote ? " CNY" : ""}</span>
          </>
        ) : (
          <>
            <span>西柚历史上限：{preflight.estimatedXiyouCredits} credits</span>
            <span>豆包历史上限：{preflight.estimatedDoubaoCost} USD</span>
          </>
        )}
      </div>

      <div className="button-row spread">
        <button
          type="button"
          disabled={!parametersComplete || applyingParameters || Boolean(preflightHash) || queued || confirmationLocked || !isV2}
          onClick={onApplyParameters}
        >
          {applyingParameters ? "正在锁定口径…" : "确认分析口径"}
        </button>
        {isV2 ? (
          <button type="button" disabled={!preflightHash || !lockedParameters || applyingParameters
            || quoteBusy || confirmationLocked || queued}
            onClick={quoteRetrySameRequest ? onRetryQuote : onRefreshQuote}>
            {quoteBusy ? "正在获取报价…" : quoteRetrySameRequest ? "使用同一请求重试报价" : "刷新可信费用报价"}
          </button>
        ) : null}
        <button
          className="primary"
          type="button"
          disabled={!isV2 || !preflightHash || !canConfirmQuote || (confirmationLocked && !confirmationOutcomeUnknown) || queued || applyingParameters}
          onClick={onConfirm}
        >
          {confirmationOutcomeUnknown ? "使用原确认键重试确认" : confirmationLocked ? "正在确认费用…" : expired ? "报价已过期" : "确认费用并开始分析"}
        </button>
        <button className="danger-link" type="button" disabled={applyingParameters || confirmationLocked || queued} onClick={onCancel}>
          取消并等待安全清理
        </button>
      </div>
    </section>
  );
}
