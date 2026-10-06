import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  humanizeSubmissionError,
  SubmissionError,
  validateReportInput,
  type ApiService,
  type PreflightFeeDialog,
} from "../lib/api";
import type { SupabaseSubmissionService } from "../lib/supabase";
import {
  acceptsFeeResponse,
  feeRequestKey,
  getConfirmableFeeQuote,
  isFeeQuoteExpired,
  type FeeQuoteRequestKey,
  type FeeQuoteUiState,
} from "./fee-quote-state";
import {
  CostConfirmationDialog,
} from "./CostConfirmationDialog";
import {
  acceptsParameterResponse,
  createParameterRequest,
  DEFAULT_TARGET_ACOS,
  type ConfirmationParameters,
} from "./parameter-lock";

export interface NewReportServices {
  api: ApiService;
  supabase: SupabaseSubmissionService;
  hashFile: (file: File) => Promise<string>;
  createTaskId: () => string;
  createIdempotencyKey: () => string;
  createFeeQuoteRequestId: () => string;
}

interface UploadContext {
  sessionId: string;
  taskId: string;
  objectPath: string;
  expiresAt: string;
  fileHash: string;
}

const EMPTY_PARAMETERS: ConfirmationParameters = {
  periodStart: "",
  periodEnd: "",
  reportType: "",
  attributionDays: "",
  attributionMetricGroup: "",
  targetAcos: DEFAULT_TARGET_ACOS,
};

function initialParameters(preflight: PreflightFeeDialog): ConfirmationParameters {
  const group = preflight.attributionMetricGroups.length === 1
    ? preflight.attributionMetricGroups[0]
    : undefined;
  return {
    periodStart: preflight.periodStart ?? "",
    periodEnd: preflight.periodEnd ?? "",
    reportType: preflight.reportType ?? "",
    attributionDays: group ? String(group.days) : "",
    attributionMetricGroup: group?.id ?? group?.fieldGroup ?? "",
    targetAcos: DEFAULT_TARGET_ACOS,
  };
}

function parametersComplete(parameters: ConfirmationParameters) {
  const targetAcos = Number(parameters.targetAcos);
  const attributionDays = Number(parameters.attributionDays);
  return /^\d{4}-\d{2}-\d{2}$/u.test(parameters.periodStart)
    && /^\d{4}-\d{2}-\d{2}$/u.test(parameters.periodEnd)
    && parameters.periodEnd >= parameters.periodStart
    && parameters.reportType.trim() !== ""
    && Number.isInteger(attributionDays) && attributionDays > 0
    && parameters.attributionMetricGroup.trim() !== ""
    && Number.isFinite(targetAcos) && targetAcos > 0 && targetAcos <= 1;
}

function reportIdentityLabel(preflight: PreflightFeeDialog) {
  if (preflight.asinSource === "user_declared" && preflight.marketplaceSource === "user_declared") {
    return `ASIN ${preflight.asin}、US（用户声明）`;
  }
  if (preflight.asinSource && preflight.marketplaceSource) {
    const asinSource = preflight.asinSource === "report" ? "报表逐行核对" : "用户声明";
    const marketplaceSource = preflight.marketplaceSource === "report" ? "报表逐行核对" : "用户声明";
    return `ASIN ${preflight.asin}（${asinSource}）、US（${marketplaceSource}）`;
  }
  return `ASIN ${preflight.asin}、US（历史预检）`;
}

export function NewReportPage({ services, viewerUserId }: { services: NewReportServices; viewerUserId: string }) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [asin, setAsin] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"form" | "working" | "preflight" | "queued" | "cancelled">("form");
  const [upload, setUpload] = useState<UploadContext | null>(null);
  const [preflight, setPreflight] = useState<PreflightFeeDialog | null>(null);
  const [feeQuoteState, setFeeQuoteState] = useState<FeeQuoteUiState>({ status: "idle" });
  const [parameters, setParameters] = useState<ConfirmationParameters>(EMPTY_PARAMETERS);
  const [preflightHash, setPreflightHash] = useState<string | null>(null);
  const [lockedParameters, setLockedParameters] = useState<Readonly<ConfirmationParameters> | null>(null);
  const [applyingParameters, setApplyingParameters] = useState(false);
  const [confirmationLocked, setConfirmationLocked] = useState(false);
  const [confirmationOutcomeUnknown, setConfirmationOutcomeUnknown] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const quoteRequest = useRef<FeeQuoteRequestKey | null>(null);
  const uploadRef = useRef<UploadContext | null>(null);
  const workspaceIdRef = useRef("");
  const parameterRevision = useRef(0);
  const parametersRef = useRef<ConfirmationParameters>(EMPTY_PARAMETERS);

  function currentQuoteRequestKey(requestId: string): FeeQuoteRequestKey | null {
    const currentUpload = uploadRef.current;
    if (!currentUpload) return null;
    return {
      userId: viewerUserId,
      workspaceId: workspaceIdRef.current.trim(),
      sessionId: currentUpload.sessionId,
      parameterRevision: parameterRevision.current,
      requestId,
    };
  }

  function sameQuoteRequest(left: FeeQuoteRequestKey, right: FeeQuoteRequestKey) {
    return acceptsFeeResponse(feeRequestKey(left), feeRequestKey(right));
  }

  async function fetchFeeQuote(request: FeeQuoteRequestKey) {
    const current = currentQuoteRequestKey(request.requestId);
    if (!current || !sameQuoteRequest(request, current)) return;
    quoteRequest.current = request;
    setFeeQuoteState({ status: "loading", request });
    setErrorMessage(null);
    try {
      const refreshedDialog = await services.api.refreshFeeQuote({
        sessionId: request.sessionId,
        requestId: request.requestId,
      });
      const latest = currentQuoteRequestKey(request.requestId);
      if (!latest || !sameQuoteRequest(request, latest)
        || !quoteRequest.current || !sameQuoteRequest(request, quoteRequest.current)) return;
      if (!preflight || refreshedDialog.asin !== preflight.asin
        || refreshedDialog.marketplace !== preflight.marketplace
        || refreshedDialog.asinSource !== preflight.asinSource
        || refreshedDialog.marketplaceSource !== preflight.marketplaceSource) {
        throw new SubmissionError("FEE_SOURCE_MISMATCH", "validation");
      }
      setPreflight(refreshedDialog);
      const quote = refreshedDialog.feeQuote;
      if (quote.state === "unavailable") {
        setFeeQuoteState({ status: "unavailable", request, quote });
      } else if (isFeeQuoteExpired(quote)) {
        setFeeQuoteState({ status: "expired", request, quote });
      } else {
        setFeeQuoteState({ status: "ready", request, quote });
      }
    } catch (error) {
      const latest = currentQuoteRequestKey(request.requestId);
      if (!latest || !sameQuoteRequest(request, latest)
        || !quoteRequest.current || !sameQuoteRequest(request, quoteRequest.current)) return;
      if (error instanceof SubmissionError && error.ambiguous) {
        setFeeQuoteState({ status: "outcome-unknown", request });
        setErrorMessage("报价结果暂时无法确认；可使用同一请求重试，不会自动新增报价。");
      } else {
        setFeeQuoteState({ status: "error", request, message: humanizeSubmissionError(error) });
        setErrorMessage(humanizeSubmissionError(error));
      }
    }
  }

  function unavailableQuoteState(reasonCode: "PARAMETERS_REQUIRED" | "PRICING_UNAVAILABLE") {
    quoteRequest.current = null;
    setFeeQuoteState({ status: "unavailable", request: null, quote: { state: "unavailable", reasonCode } });
  }

  useEffect(() => {
    if (feeQuoteState.status !== "ready") return undefined;
    const expiresAtMs = Date.parse(feeQuoteState.quote.expiresAt);
    const delay = expiresAtMs - Date.now();
    if (delay <= 0) {
      setFeeQuoteState({ status: "expired", request: feeQuoteState.request, quote: feeQuoteState.quote });
      return undefined;
    }
    let timer = 0;
    const checkExpiry = () => {
      const remaining = expiresAtMs - Date.now();
      if (remaining <= 0) {
        setFeeQuoteState((current) => current.status === "ready"
          && current.request.requestId === feeQuoteState.request.requestId
          ? { status: "expired", request: current.request, quote: current.quote }
          : current);
        return;
      }
      timer = window.setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    };
    timer = window.setTimeout(checkExpiry, Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [feeQuoteState]);

  useEffect(() => {
    if (!upload || phase === "queued" || phase === "cancelled") return undefined;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [upload, phase]);

  function resetSubmission(nextFile: File | null) {
    parameterRevision.current += 1;
    parametersRef.current = EMPTY_PARAMETERS;
    uploadRef.current = null;
    quoteRequest.current = null;
    setFile(nextFile);
    setPhase("form");
    setUpload(null);
    setPreflight(null);
    setFeeQuoteState({ status: "idle" });
    setParameters(EMPTY_PARAMETERS);
    setPreflightHash(null);
    setLockedParameters(null);
    setConfirmationLocked(false);
    setConfirmationOutcomeUnknown(false);
    setTaskId(null);
    setErrorMessage(null);
    idempotencyKey.current = null;
  }

  async function runPreflight(event: FormEvent) {
    event.preventDefault();
    const validation = validateReportInput({ asin, file });
    if (validation) {
      setErrorMessage(validation);
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(workspaceId.trim())) {
      setErrorMessage("工作区 ID 格式不正确。");
      return;
    }
    const selectedFile = file as File;
    const nextTaskId = services.createTaskId();
    const suffix = selectedFile.name.toLowerCase().endsWith(".xlsx") ? ".xlsx" : ".csv";
    const expectedPath = `${viewerUserId}/${nextTaskId}${suffix}`;
    setPhase("working");
    setErrorMessage(null);
    try {
      const fileHash = await services.hashFile(selectedFile);
      const signed = await services.api.createUploadSession({
        workspaceId: workspaceId.trim(),
        originalFilename: selectedFile.name,
        fileHash,
        uploadPurpose: "初始分析",
        taskId: nextTaskId,
        asin: asin.trim().toUpperCase(),
        marketplace: "US",
      });
      if (signed.path !== expectedPath) throw new SubmissionError("UPLOAD_PATH_MISMATCH", "validation");
      const uploadContext = { sessionId: signed.sessionId, taskId: nextTaskId,
        objectPath: signed.path, expiresAt: signed.expiresAt, fileHash };
      uploadRef.current = uploadContext;
      setUpload(uploadContext);
      await services.supabase.uploadToSignedUrl({
        bucket: signed.bucket,
        path: signed.path,
        token: signed.token,
        file: selectedFile,
        upsert: false,
      });
      const result = await services.api.runPreflight(signed.sessionId);
      if (result.asin !== asin.trim().toUpperCase()) {
        setPhase("form");
        setErrorMessage(result.asinSource === "user_declared"
          ? "预检返回的 ASIN 与用户声明不一致，未进入费用确认。"
          : "文件检测到的 ASIN 与输入 ASIN 不一致，未进入费用确认。");
        return;
      }
      const nextParameters = initialParameters(result);
      parameterRevision.current += 1;
      parametersRef.current = nextParameters;
      setPreflight(result);
      if (result.responseSchemaVersion === "preflight-fee-dialog-v2") {
        const initialQuote = result.feeQuote.state === "unavailable"
          ? result.feeQuote
          : { state: "unavailable" as const, reasonCode: "PARAMETERS_REQUIRED" as const };
        setFeeQuoteState({ status: "unavailable", request: null, quote: initialQuote });
      } else {
        setFeeQuoteState({ status: "legacy" });
      }
      setParameters(nextParameters);
      setPhase("preflight");
    } catch (error) {
      setPhase("form");
      setErrorMessage(humanizeSubmissionError(error));
    }
  }

  async function applyParameters() {
    if (!upload || !preflight || applyingParameters || preflightHash
      || preflight.responseSchemaVersion !== "preflight-fee-dialog-v2"
      || !parametersComplete(parametersRef.current)) return;
    const request = createParameterRequest(parametersRef.current, parameterRevision.current);
    setApplyingParameters(true);
    setErrorMessage(null);
    try {
      const nextHash = await services.supabase.setPreflightParameters({
        sessionId: upload.sessionId,
        periodStart: request.parameters.periodStart,
        periodEnd: request.parameters.periodEnd,
        marketplace: "US",
        currency: "USD",
        reportType: preflight.reportType,
        attributionDays: Number(request.parameters.attributionDays),
        attributionMetricGroup: request.parameters.attributionMetricGroup.trim(),
        targetAcos: request.parameters.targetAcos,
      });
      if (!acceptsParameterResponse(
        request,
        parameterRevision.current,
        parametersRef.current,
      )) return;
      setPreflightHash(nextHash);
      setLockedParameters(request.parameters);
      quoteRequest.current = null;
      idempotencyKey.current = null;
      const quoteRequestId = services.createFeeQuoteRequestId();
      const quoteKey = currentQuoteRequestKey(quoteRequestId);
      if (quoteKey && quoteKey.parameterRevision === request.revision) {
        await fetchFeeQuote(quoteKey);
      }
    } catch (error) {
      if (acceptsParameterResponse(
        request,
        parameterRevision.current,
        parametersRef.current,
      )) setErrorMessage(humanizeSubmissionError(error));
    } finally {
      setApplyingParameters(false);
    }
  }

  async function confirmCosts() {
    const quote = getConfirmableFeeQuote(feeQuoteState, confirmationOutcomeUnknown);
    if (!upload || !preflight || preflight.responseSchemaVersion !== "preflight-fee-dialog-v2"
      || !preflightHash || !quote || (confirmationLocked && !confirmationOutcomeUnknown)
      || (confirmationOutcomeUnknown && !idempotencyKey.current)) return;
    if (!idempotencyKey.current) idempotencyKey.current = services.createIdempotencyKey();
    const key = idempotencyKey.current;
    setConfirmationLocked(true);
    setConfirmationOutcomeUnknown(false);
    setErrorMessage(null);
    try {
      const nextTaskId = await services.supabase.confirmKeywordTask({
        sessionId: upload.sessionId,
        taskId: upload.taskId,
        objectPath: upload.objectPath,
        fileHash: upload.fileHash,
        preflightHash,
        idempotencyKey: key,
        asin: preflight.asin,
        analysisVersion: "analysis-v1",
        snapshotVersion: "snapshot-v1",
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash,
      });
      setTaskId(nextTaskId);
      setPhase("queued");
      setConfirmationOutcomeUnknown(false);
    } catch (error) {
      const ambiguous = error instanceof SubmissionError ? error.ambiguous : true;
      if (ambiguous) {
        setErrorMessage("费用确认结果暂时无法判定；不会换新确认键或报价，可使用原确认键安全重试。");
        setConfirmationLocked(true);
        setConfirmationOutcomeUnknown(true);
      } else {
        setErrorMessage(error instanceof SubmissionError && error.kind === "validation"
          ? "费用确认被服务端明确拒绝；未生成新授权，可检查后使用原确认键重试。"
          : humanizeSubmissionError(error));
        setConfirmationLocked(false);
        setConfirmationOutcomeUnknown(false);
      }
    }
  }

  function editParameters() {
    if (!lockedParameters || confirmationLocked || phase === "queued") return;
    parameterRevision.current += 1;
    parametersRef.current = { ...lockedParameters };
    setParameters(parametersRef.current);
    setPreflightHash(null);
    setLockedParameters(null);
    idempotencyKey.current = null;
    setConfirmationOutcomeUnknown(false);
    unavailableQuoteState("PARAMETERS_REQUIRED");
  }

  function refreshFeeQuote() {
    if (!upload || !preflight || preflight.responseSchemaVersion !== "preflight-fee-dialog-v2"
      || !preflightHash || !lockedParameters || applyingParameters || confirmationLocked || phase === "queued") return;
    idempotencyKey.current = null;
    const requestKey = currentQuoteRequestKey(services.createFeeQuoteRequestId());
    if (requestKey) void fetchFeeQuote(requestKey);
  }

  function retryFeeQuote() {
    const request = quoteRequest.current;
    if (!request || feeQuoteState.status !== "outcome-unknown" || confirmationLocked || phase === "queued") return;
    const current = currentQuoteRequestKey(request.requestId);
    if (!current || !sameQuoteRequest(request, current)) return;
    void fetchFeeQuote(request);
  }

  async function cancelUpload() {
    if (!upload || applyingParameters || confirmationLocked || phase === "queued") return;
    setErrorMessage(null);
    try {
      await services.supabase.cancelUploadSession(upload.sessionId);
      setPhase("cancelled");
    } catch (error) {
      setErrorMessage(humanizeSubmissionError(error));
    }
  }

  const status = phase === "working"
    ? "正在创建受控上传会话、上传并运行免费预检…"
    : null;

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Keyword Battle Tool</p>
          <h1>新建关键词分析报告</h1>
          <p className="lede">确认费用前不会创建任务、入队或调用任何付费服务。</p>
        </div>
      </header>

      {phase !== "queued" && phase !== "cancelled" ? (
        <form className="submission-card" onSubmit={(event) => void runPreflight(event)}>
          <div className="form-grid">
            <label>
              工作区 ID
              <input value={workspaceId} onChange={(event) => {
                workspaceIdRef.current = event.target.value;
                setWorkspaceId(event.target.value);
              }} disabled={phase !== "form"} />
            </label>
            <label>
              ASIN
              <input value={asin} onChange={(event) => setAsin(event.target.value.toUpperCase())} disabled={phase !== "form"} />
            </label>
            <label className="file-field" htmlFor="report-file">广告报告文件</label>
            <div className="file-field">
              <input id="report-file" type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => resetSubmission(event.target.files?.[0] ?? null)} disabled={phase !== "form"} />
              <span>.xlsx / .csv，最大 20 MB</span>
            </div>
          </div>
          <p className="notice">整份报表仅属于所填 ASIN、美国站；无 ASIN 或站点列时按此声明归属，请先核实再上传。</p>
          <button className="primary" type="submit" disabled={phase !== "form"}>运行免费预检</button>
        </form>
      ) : null}

      {status ? <p className="notice" role="status">{status}</p> : null}
      {errorMessage ? <p className="error-notice" role="alert">{errorMessage}</p> : null}

      {phase === "preflight" && upload && preflight ? (
        <>
          <p className="notice" role="status">{reportIdentityLabel(preflight)}</p>
          <CostConfirmationDialog
            preflight={preflight}
            feeQuoteState={feeQuoteState}
            expiresAt={upload.expiresAt}
            parameters={parameters}
            parametersComplete={parametersComplete(parameters)}
            preflightHash={preflightHash}
            lockedParameters={lockedParameters}
            applyingParameters={applyingParameters}
            confirmationLocked={confirmationLocked}
            confirmationOutcomeUnknown={confirmationOutcomeUnknown}
            queued={false}
            onParameterChange={(field, value) => {
              if (applyingParameters || preflightHash) return;
              const nextParameters = { ...parametersRef.current, [field]: value };
              parameterRevision.current += 1;
              parametersRef.current = nextParameters;
              setParameters(nextParameters);
              setPreflightHash(null);
              setLockedParameters(null);
              idempotencyKey.current = null;
              unavailableQuoteState("PARAMETERS_REQUIRED");
            }}
            onAttributionGroupChange={(groupId) => {
              if (applyingParameters || preflightHash) return;
              const group = preflight.attributionMetricGroups.find((candidate) => candidate.id === groupId);
              const nextParameters = {
                ...parametersRef.current,
                attributionMetricGroup: group?.id ?? "",
                attributionDays: group ? String(group.days) : "",
              };
              parameterRevision.current += 1;
              parametersRef.current = nextParameters;
              setParameters(nextParameters);
              setPreflightHash(null);
              setLockedParameters(null);
              idempotencyKey.current = null;
              unavailableQuoteState("PARAMETERS_REQUIRED");
            }}
            onApplyParameters={() => void applyParameters()}
            onEditParameters={editParameters}
            onRefreshQuote={refreshFeeQuote}
            onRetryQuote={retryFeeQuote}
            onConfirm={() => void confirmCosts()}
            onCancel={() => void cancelUpload()}
          />
          {preflightHash && feeQuoteState.status !== "loading"
            ? <p className="success-notice" role="status">分析口径已锁定，可进行费用确认。</p> : null}
        </>
      ) : null}

      {phase === "queued" && taskId ? (
        <section className="result-card" role="status">
          <h2>任务 {taskId} 已进入队列</h2>
          <p>本次客户端幂等键已保留；请勿用新键重复授权。</p>
          <Link className="button-link" to={`/tasks/${taskId}/workbench`}>打开任务工作台</Link>
        </section>
      ) : null}

      {phase === "cancelled" ? (
        <section className="result-card" role="status">
          <h2>已取消</h2>
          <p>上传已取消；服务端已标记待安全清理。未创建任务，也未授权费用。</p>
        </section>
      ) : null}
    </main>
  );
}
