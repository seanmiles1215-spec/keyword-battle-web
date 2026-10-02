export type FeeQuoteUnavailableReason =
  | "PRICING_UNAVAILABLE"
  | "PRICING_EXPIRED"
  | "PRICING_UNSUPPORTED"
  | "PARAMETERS_REQUIRED"
  | "SOURCE_EXPIRED";

export interface ProviderFeeAmount {
  provider: "豆包" | "西柚";
  currencyOrUnit: "CNY" | "credits";
  estimatedCost: string;
  lockedCap: string;
}

export interface ReadyFeeQuote {
  state: "ready";
  quoteId: string;
  quoteHash: string;
  feeProtocolVersion: "provider-fees-v2";
  expiresAt: string;
  providers: readonly [ProviderFeeAmount, ProviderFeeAmount];
  current?: boolean;
}

export interface UnavailableFeeQuote {
  state: "unavailable";
  reasonCode: FeeQuoteUnavailableReason;
}

export type FeeQuote = ReadyFeeQuote | UnavailableFeeQuote;

export interface FeeQuoteRequestKey {
  userId: string;
  workspaceId: string;
  sessionId: string;
  parameterRevision: number;
  requestId: string;
}

export function feeRequestKey(request: FeeQuoteRequestKey) {
  if (!Number.isSafeInteger(request.parameterRevision) || request.parameterRevision < 0) {
    throw new TypeError("fee quote request revision is invalid");
  }
  return JSON.stringify([
    request.userId,
    request.workspaceId,
    request.sessionId,
    request.parameterRevision,
    request.requestId,
  ]);
}

export function acceptsFeeResponse(requestKey: string, currentKey: string) {
  return requestKey === currentKey;
}

export type FeeQuoteUiState =
  | { status: "idle" }
  | { status: "legacy" }
  | { status: "loading"; request: FeeQuoteRequestKey }
  | { status: "ready"; request: FeeQuoteRequestKey; quote: ReadyFeeQuote }
  | { status: "unavailable"; request: FeeQuoteRequestKey | null; quote: UnavailableFeeQuote }
  | { status: "outcome-unknown"; request: FeeQuoteRequestKey }
  | { status: "error"; request: FeeQuoteRequestKey; message: string }
  | { status: "expired"; request: FeeQuoteRequestKey; quote: ReadyFeeQuote };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const AMOUNT = /^(?:0|[1-9]\d{0,11})\.\d{6}$/u;
const UNAVAILABLE_REASONS = new Set<FeeQuoteUnavailableReason>([
  "PRICING_UNAVAILABLE", "PRICING_EXPIRED", "PRICING_UNSUPPORTED", "PARAMETERS_REQUIRED", "SOURCE_EXPIRED",
]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function normalizeProviderFee(value: unknown, expected: ProviderFeeAmount["provider"], unit: ProviderFeeAmount["currencyOrUnit"]): ProviderFeeAmount {
  if (!record(value) || !exactKeys(value, ["provider", "currencyOrUnit", "estimatedCost", "lockedCap"])
    || value.provider !== expected || value.currencyOrUnit !== unit
    || typeof value.estimatedCost !== "string" || !AMOUNT.test(value.estimatedCost)
    || typeof value.lockedCap !== "string" || !AMOUNT.test(value.lockedCap)
    || value.estimatedCost !== value.lockedCap) {
    throw new TypeError("provider fee quote is invalid");
  }
  return Object.freeze({ provider: expected, currencyOrUnit: unit,
    estimatedCost: value.estimatedCost, lockedCap: value.lockedCap });
}

export function normalizeFeeQuote(value: unknown): FeeQuote {
  if (!record(value) || typeof value.state !== "string") throw new TypeError("fee quote is invalid");
  if (value.state === "unavailable") {
    if (!exactKeys(value, ["state", "reasonCode"])
      || typeof value.reasonCode !== "string"
      || !UNAVAILABLE_REASONS.has(value.reasonCode as FeeQuoteUnavailableReason)) {
      throw new TypeError("unavailable fee quote is invalid");
    }
    return Object.freeze({ state: "unavailable", reasonCode: value.reasonCode as FeeQuoteUnavailableReason });
  }
  if (value.state !== "ready" || !exactKeys(value,
    ["state", "quoteId", "quoteHash", "feeProtocolVersion", "expiresAt", "providers", "current"])
    || typeof value.quoteId !== "string" || !UUID.test(value.quoteId)
    || typeof value.quoteHash !== "string" || !SHA256.test(value.quoteHash)
    || value.feeProtocolVersion !== "provider-fees-v2"
    || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))
    || new Date(value.expiresAt).toISOString() !== value.expiresAt
    || (value.current !== undefined && typeof value.current !== "boolean")
    || !Array.isArray(value.providers) || value.providers.length !== 2) {
    throw new TypeError("ready fee quote is invalid");
  }
  const doubao = normalizeProviderFee(value.providers[0], "豆包", "CNY");
  const xiyou = normalizeProviderFee(value.providers[1], "西柚", "credits");
  return Object.freeze({ state: "ready", quoteId: value.quoteId, quoteHash: value.quoteHash,
    feeProtocolVersion: "provider-fees-v2", expiresAt: value.expiresAt,
    providers: Object.freeze([doubao, xiyou]) as readonly [ProviderFeeAmount, ProviderFeeAmount],
    ...(value.current === undefined ? {} : { current: value.current as boolean }) });
}

export function isFeeQuoteExpired(quote: ReadyFeeQuote, now = Date.now()) {
  return now >= Date.parse(quote.expiresAt);
}

export function getConfirmableFeeQuote(
  state: FeeQuoteUiState,
  allowExactAmbiguousReplay = false,
): ReadyFeeQuote | null {
  if (allowExactAmbiguousReplay && state.status === "expired") return state.quote;
  if (state.status !== "ready") return null;
  if (allowExactAmbiguousReplay) return state.quote;
  return !isFeeQuoteExpired(state.quote) && state.quote.current !== false ? state.quote : null;
}

export function isCurrentFeeQuoteRequest(request: FeeQuoteRequestKey, current: FeeQuoteRequestKey) {
  return acceptsFeeResponse(feeRequestKey(request), feeRequestKey(current));
}
