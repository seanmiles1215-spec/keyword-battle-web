import { normalizeFeeQuote, type FeeQuote } from "../new-report/fee-quote-state";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type SubmissionErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "validation"
  | "expired"
  | "needs_parameters"
  | "network"
  | "unknown";

export class SubmissionError extends Error {
  readonly code: string;
  readonly kind: SubmissionErrorKind;
  readonly ambiguous: boolean;

  constructor(code: string, kind: SubmissionErrorKind, ambiguous = false, message = code) {
    super(message);
    this.name = "SubmissionError";
    this.code = code;
    this.kind = kind;
    this.ambiguous = ambiguous;
  }
}

export interface UploadSessionResponse {
  sessionId: string;
  bucket: string;
  path: string;
  token: string;
  expiresAt: string;
}

export interface AttributionMetricGroup {
  id: string;
  worksheets: string[];
  days: number;
  fieldGroup: string;
  occurrence: number;
  headers: string[];
  metrics: readonly ("sales" | "orders")[];
}

interface PreflightFeeDialogBase {
  asin: string;
  asinSource?: "user_declared" | "report";
  marketplaceSource?: "user_declared" | "report";
  periodStart: string | null;
  periodEnd: string | null;
  periodDays: number | null;
  marketplace: "US" | null;
  currency: "USD" | null;
  reportType: string;
  attributionDaysCandidates: number[];
  attributionMetricGroups: AttributionMetricGroup[];
  estimatedKeywordCount: number;
  manualExecutionScopeRequired: boolean;
  preflightStatus: "可确认" | "需补口径";
  preflightBlockers: string[];
  preflightWarnings: string[];
}

export interface LegacyPreflightFeeDialog extends PreflightFeeDialogBase {
  responseSchemaVersion?: "preflight-fee-dialog-v1";
  estimatedXiyouCredits: string;
  estimatedDoubaoCost: string;
  calculationBasis: { keywordCount: number; parserVersion: string; pricingVersion: string };
}

export interface V2PreflightFeeDialog extends PreflightFeeDialogBase {
  responseSchemaVersion: "preflight-fee-dialog-v2";
  calculationBasis: { keywordCount: number; parserVersion: string };
  feeQuote: FeeQuote;
}

export type PreflightFeeDialog = LegacyPreflightFeeDialog | V2PreflightFeeDialog;

export interface ApiService {
  createUploadSession(input: {
    workspaceId: string;
    originalFilename: string;
    fileHash: string;
    uploadPurpose: "初始分析";
    taskId: string;
    asin: string;
    marketplace: "US";
  } | {
    workspaceId: string;
    originalFilename: string;
    fileHash: string;
    uploadPurpose: "复盘数据";
    taskId?: never;
    asin?: never;
    marketplace?: never;
  }): Promise<UploadSessionResponse>;
  runPreflight(sessionId: string): Promise<PreflightFeeDialog>;
  refreshFeeQuote(input: { sessionId: string; requestId: string }): Promise<V2PreflightFeeDialog>;
  runReviewDatasetPreflight(input: ReviewDatasetPreflightRequest): Promise<ReviewDatasetPreflight>;
  requestSnapshotUrl(reportId: string): Promise<SnapshotUrlResponse>;
  createRankCheckQuote(input: { actionItemId: string; idempotencyKey: string; observationDate: string }): Promise<RankCheckQuote>;
}

export interface RankCheckQuote {
  requestId: string;
  actionItemId: string;
  idempotencyKey: string;
  observationDate: string;
  estimatedCredits: string;
  environmentLabel: "XYDC / US / 历史日级趋势";
  quoteVersion: "rank-quote-xydc-daily-v1";
  standardVersion: "xydc-daily-rank-v1";
  requestStatus: "待确认";
}

export type ReviewDatasetRole = "执行前基准" | "执行后结果";
export interface ReviewDatasetPreflightRequest {
  sessionId: string;
  reportId: string;
  actionItemId: string;
  datasetRole: ReviewDatasetRole;
}

export interface ReviewDatasetPreflight {
  reviewDatasetId: string;
  reportId: string;
  actionItemId: string;
  datasetRole: ReviewDatasetRole;
  comparable: boolean;
  blockers: string[];
}

export interface SnapshotUrlResponse {
  signedUrl: string;
  expiresInSeconds: 300;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;

function requiredUrl(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new TypeError(`${label} must use HTTPS`);
  }
  return url.toString().replace(/\/$/u, "");
}

function classifyStatus(status: number, code: string) {
  if (status === 401) return new SubmissionError(code, "unauthenticated");
  if (status === 403) return new SubmissionError(code, "forbidden");
  if (code === "FEE_QUOTE_OUTCOME_UNKNOWN") return new SubmissionError(code, "network", true);
  if (/PREFLIGHT_BLOCKED|PARAMETERS_REQUIRED/u.test(code)) {
    return new SubmissionError(code, "needs_parameters");
  }
  if ((status === 409 || status === 410) && /EXPIRED|NOT_READY|NOT_FOUND/u.test(code)) {
    return new SubmissionError(code, "expired");
  }
  if (status >= 400 && status < 500) return new SubmissionError(code, "validation");
  return new SubmissionError(code, "network");
}

async function responsePayload(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function requireUploadSession(value: unknown): UploadSessionResponse {
  const candidate = value as Partial<UploadSessionResponse> | null;
  if (!candidate
    || !UUID.test(candidate.sessionId ?? "")
    || typeof candidate.bucket !== "string" || candidate.bucket === ""
    || typeof candidate.path !== "string" || candidate.path === ""
    || typeof candidate.token !== "string" || candidate.token === ""
    || typeof candidate.expiresAt !== "string" || !Number.isFinite(Date.parse(candidate.expiresAt))) {
    throw new SubmissionError("INVALID_API_RESPONSE", "network");
  }
  return candidate as UploadSessionResponse;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validDate(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function validMetricGroups(value: unknown): value is AttributionMetricGroup[] {
  return Array.isArray(value) && value.every((item) => record(item)
    && exactKeys(item, ["id", "worksheets", "days", "fieldGroup", "occurrence", "headers", "metrics"])
    && typeof item.id === "string" && item.id.length > 0
    && Array.isArray(item.worksheets) && item.worksheets.every((entry) => typeof entry === "string")
    && Number.isSafeInteger(item.days) && Number(item.days) > 0
    && typeof item.fieldGroup === "string" && item.fieldGroup.length > 0
    && Number.isSafeInteger(item.occurrence) && Number(item.occurrence) > 0
    && Array.isArray(item.headers) && item.headers.every((entry) => typeof entry === "string")
    && Array.isArray(item.metrics) && item.metrics.every((entry) => entry === "sales" || entry === "orders"));
}

const FEE_DIALOG_BASE_KEYS = ["asin", "periodStart", "periodEnd", "periodDays", "marketplace", "currency",
  "reportType", "attributionDaysCandidates", "attributionMetricGroups", "estimatedKeywordCount",
  "manualExecutionScopeRequired", "preflightStatus", "preflightBlockers", "preflightWarnings",
  "asinSource", "marketplaceSource"] as const;

function requireFeeDialog(value: unknown): PreflightFeeDialog {
  const candidate = value as Record<string, unknown> | null;
  if (!record(candidate) || typeof candidate.asin !== "string" || !/^[A-Z0-9]{10}$/u.test(candidate.asin)
    || !validDate(candidate.periodStart) || !validDate(candidate.periodEnd)
    || !(candidate.periodDays === null || (Number.isSafeInteger(candidate.periodDays) && Number(candidate.periodDays) > 0))
    || !(candidate.marketplace === null || candidate.marketplace === "US")
    || !(candidate.currency === null || candidate.currency === "USD")
    || typeof candidate.reportType !== "string" || candidate.reportType.length === 0
    || !Array.isArray(candidate.attributionDaysCandidates)
    || candidate.attributionDaysCandidates.some((days) => !Number.isSafeInteger(days) || Number(days) <= 0)
    || !validMetricGroups(candidate.attributionMetricGroups)
    || !Number.isSafeInteger(candidate.estimatedKeywordCount) || Number(candidate.estimatedKeywordCount) < 0
    || typeof candidate.manualExecutionScopeRequired !== "boolean"
    || !Array.isArray(candidate.preflightBlockers)
    || candidate.preflightBlockers.some((item) => typeof item !== "string")
    || !Array.isArray(candidate.preflightWarnings)
    || candidate.preflightWarnings.some((item) => typeof item !== "string")
    || !["可确认", "需补口径"].includes(String(candidate.preflightStatus))
    || ((candidate.asinSource === undefined) !== (candidate.marketplaceSource === undefined))
    || (candidate.asinSource !== undefined && !["user_declared", "report"].includes(String(candidate.asinSource)))
    || (candidate.marketplaceSource !== undefined && !["user_declared", "report"].includes(String(candidate.marketplaceSource)))
    || !record(candidate.calculationBasis)) {
    throw new SubmissionError("INVALID_API_RESPONSE", "network");
  }
  const calculationBasis = candidate.calculationBasis as Record<string, unknown>;
  if (!Number.isSafeInteger(calculationBasis.keywordCount) || Number(calculationBasis.keywordCount) < 0
    || typeof calculationBasis.parserVersion !== "string" || calculationBasis.parserVersion.length === 0) {
    throw new SubmissionError("INVALID_API_RESPONSE", "network");
  }
  if (candidate.responseSchemaVersion === "preflight-fee-dialog-v2") {
    if (!exactKeys(candidate, ["responseSchemaVersion", ...FEE_DIALOG_BASE_KEYS, "calculationBasis", "feeQuote"])
      || !exactKeys(calculationBasis, ["keywordCount", "parserVersion"])
      || !(candidate.periodStart === null && candidate.periodEnd === null && candidate.periodDays === null)
        && (candidate.periodStart === null || candidate.periodEnd === null || candidate.periodDays === null)) {
      throw new SubmissionError("INVALID_API_RESPONSE", "network");
    }
    try {
      return { ...candidate, feeQuote: normalizeFeeQuote(candidate.feeQuote) } as unknown as V2PreflightFeeDialog;
    } catch {
      throw new SubmissionError("INVALID_API_RESPONSE", "network");
    }
  }
  if ((candidate.responseSchemaVersion !== undefined && candidate.responseSchemaVersion !== "preflight-fee-dialog-v1")
    || typeof candidate.estimatedXiyouCredits !== "string"
    || typeof candidate.estimatedDoubaoCost !== "string"
    || typeof calculationBasis.pricingVersion !== "string"
    || !exactKeys(candidate, [...FEE_DIALOG_BASE_KEYS, "responseSchemaVersion", "calculationBasis",
      "estimatedXiyouCredits", "estimatedDoubaoCost"])
    || !exactKeys(calculationBasis, ["keywordCount", "parserVersion", "pricingVersion"])) {
    throw new SubmissionError("INVALID_API_RESPONSE", "network");
  }
  return candidate as unknown as LegacyPreflightFeeDialog;
}

function requireReviewDatasetPreflight(value: unknown, expected: ReviewDatasetPreflightRequest): ReviewDatasetPreflight {
  const candidate = value as Partial<ReviewDatasetPreflight> | null;
  if (!candidate || !UUID.test(candidate.reviewDatasetId ?? "")
    || candidate.reportId !== expected.reportId || candidate.actionItemId !== expected.actionItemId
    || candidate.datasetRole !== expected.datasetRole
    || typeof candidate.comparable !== "boolean" || !Array.isArray(candidate.blockers)
    || candidate.blockers.some((item) => typeof item !== "string")) {
    throw new SubmissionError("INVALID_API_RESPONSE", "network");
  }
  return candidate as ReviewDatasetPreflight;
}

function requireSnapshotUrl(value: unknown): SnapshotUrlResponse {
  const candidate = value as Partial<SnapshotUrlResponse> | null;
  if (!candidate || candidate.expiresInSeconds !== 300 || typeof candidate.signedUrl !== "string") {
    throw new SubmissionError("INVALID_API_RESPONSE", "network");
  }
  let url: URL;
  try { url = new URL(candidate.signedUrl); } catch { throw new SubmissionError("INVALID_API_RESPONSE", "network"); }
  if (url.protocol !== "https:") throw new SubmissionError("INVALID_API_RESPONSE", "network");
  return candidate as SnapshotUrlResponse;
}

function requireRankCheckQuote(value: unknown, expected: { actionItemId: string; idempotencyKey: string; observationDate: string }): RankCheckQuote {
  const candidate = value as Partial<RankCheckQuote> | null;
  if (!candidate || !UUID.test(candidate.requestId ?? "")
    || candidate.actionItemId !== expected.actionItemId || candidate.idempotencyKey !== expected.idempotencyKey
    || candidate.observationDate !== expected.observationDate || candidate.estimatedCredits !== "1.000000"
    || candidate.environmentLabel !== "XYDC / US / 历史日级趋势"
    || candidate.quoteVersion !== "rank-quote-xydc-daily-v1" || candidate.standardVersion !== "xydc-daily-rank-v1"
    || candidate.requestStatus !== "待确认") {
    throw new SubmissionError("INVALID_API_RESPONSE", "network");
  }
  return candidate as RankCheckQuote;
}

export function createApiService({
  apiBaseUrl,
  getAccessToken,
  fetchImpl = globalThis.fetch,
}: {
  apiBaseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}): ApiService {
  const baseUrl = requiredUrl(apiBaseUrl, "apiBaseUrl");

  async function request(path: string, init: RequestInit) {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new SubmissionError("UNAUTHENTICATED", "unauthenticated");
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...init.headers,
        },
      });
    } catch {
      throw new SubmissionError("NETWORK_FAILURE", "network");
    }
    const payload = await responsePayload(response);
    if (!response.ok) {
      const code = (payload as { error?: { code?: unknown } } | null)?.error?.code;
      throw classifyStatus(response.status, typeof code === "string" ? code : "API_REQUEST_FAILED");
    }
    return payload;
  }

  return {
    async createUploadSession(input) {
      if (!UUID.test(input.workspaceId) || !SHA256.test(input.fileHash)) {
        throw new SubmissionError("INVALID_REQUEST", "validation");
      }
      if (input.uploadPurpose === "初始分析" ? !UUID.test(input.taskId)
        || !/^B0[A-Z0-9]{8}$/u.test(input.asin) || input.marketplace !== "US"
        : input.taskId !== undefined || input.asin !== undefined || input.marketplace !== undefined) {
        throw new SubmissionError("INVALID_REQUEST", "validation");
      }
      return requireUploadSession(await request("/v1/upload-sessions", {
        method: "POST",
        body: JSON.stringify(input),
      }));
    },
    async runPreflight(sessionId) {
      if (!UUID.test(sessionId)) throw new SubmissionError("INVALID_REQUEST", "validation");
      return requireFeeDialog(await request(`/v1/preflight/${encodeURIComponent(sessionId)}`, {
        method: "POST",
      }));
    },
    async refreshFeeQuote(input) {
      if (!UUID.test(input.sessionId) || !UUID.test(input.requestId)) {
        throw new SubmissionError("INVALID_REQUEST", "validation");
      }
      try {
        const response = await request(`/v1/fee-quotes/${encodeURIComponent(input.sessionId)}`, {
          method: "POST",
          body: JSON.stringify({ requestId: input.requestId }),
        });
        const dialog = requireFeeDialog(response);
        if (dialog.responseSchemaVersion !== "preflight-fee-dialog-v2") {
          throw new SubmissionError("INVALID_API_RESPONSE", "network");
        }
        return dialog;
      } catch (error) {
        if (error instanceof SubmissionError && (error.kind === "network" || error.code === "INVALID_API_RESPONSE")) {
          throw new SubmissionError(error.code, error.kind, true, error.message);
        }
        throw error;
      }
    },
    async runReviewDatasetPreflight(input) {
      if (!UUID.test(input.sessionId) || !UUID.test(input.reportId) || !UUID.test(input.actionItemId)
        || !["执行前基准", "执行后结果"].includes(input.datasetRole)) {
        throw new SubmissionError("INVALID_REQUEST", "validation");
      }
      const response = await request(`/v1/review-datasets/${encodeURIComponent(input.sessionId)}/preflight`, {
        method: "POST",
        body: JSON.stringify({ reportId: input.reportId, actionItemId: input.actionItemId, datasetRole: input.datasetRole }),
      });
      return requireReviewDatasetPreflight(response, input);
    },
    async requestSnapshotUrl(reportId) {
      if (!UUID.test(reportId)) throw new SubmissionError("INVALID_REQUEST", "validation");
      return requireSnapshotUrl(await request(`/v1/reports/${encodeURIComponent(reportId)}/snapshot-url`, {
        method: "POST",
      }));
    },
    async createRankCheckQuote(input) {
      if (!UUID.test(input.actionItemId) || !UUID.test(input.idempotencyKey)
        || !/^\d{4}-\d{2}-\d{2}$/u.test(input.observationDate)) {
        throw new SubmissionError("INVALID_REQUEST", "validation");
      }
      return requireRankCheckQuote(await request("/v1/rank-check-requests", {
        method: "POST",
        body: JSON.stringify(input),
      }), input);
    },
  };
}

export async function hashFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateReportInput({ asin, file }: { asin: string; file: File | null }) {
  if (!/^[A-Z0-9]{10}$/u.test(asin.trim().toUpperCase())) return "ASIN 必须是 10 位字母或数字。";
  if (!file) return "请选择广告报告文件。";
  if (!/\.(xlsx|csv)$/iu.test(file.name)) return "仅支持 .xlsx 或 .csv 报告文件。";
  if (file.size > MAX_UPLOAD_BYTES) return "文件不能超过 20 MB。";
  return null;
}

export function humanizeSubmissionError(error: unknown) {
  if (!(error instanceof SubmissionError)) return "服务暂时不可用，请稍后重试。";
  if (error.kind === "unauthenticated") return "登录已失效，请重新登录。";
  if (error.kind === "forbidden") return "当前成员权限已停用或无权执行此操作，请重新登录或联系管理员。";
  if (error.kind === "expired") return "上传会话已到期或状态不可用，请重新选择文件。";
  if (error.kind === "needs_parameters") return "Preflight 仍有阻塞项，请补齐分析口径后再确认费用。";
  if (error.code === "UPLOAD_TRANSPORT_FAILURE") return "上传网络失败，尚未确认费用；可安全重试免费上传步骤。";
  if (error.code === "UPLOAD_TOO_LARGE") return "文件不能超过 20 MB。";
  if (error.code === "UPLOAD_REJECTED") return "文件安全检查或格式校验未通过，请检查报告后重试。";
  if (error.code === "REVIEW_ASIN_MISSING" || error.code === "REVIEW_ASIN_INVALID") return "复盘文件缺少合法 ASIN。";
  if (error.code === "REVIEW_ASIN_MISMATCH") return "复盘文件 ASIN 与动作报告不一致。";
  if (error.code === "REVIEW_EXECUTION_OBJECT_MISMATCH") return "复盘文件不包含已确认的执行对象。";
  if (error.code === "REVIEW_WINDOW_MISMATCH") return "复盘文件周期与执行前后窗口不一致。";
  if (error.kind === "validation") return "请求未通过安全或状态校验，请检查输入。";
  return "网络或服务暂时不可用；未确认费用时可安全重试免费步骤。";
}
