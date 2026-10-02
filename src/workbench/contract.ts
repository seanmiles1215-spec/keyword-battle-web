import {
  ACTION_CATEGORIES,
  type ActionCategory,
  type ActionReview,
  type ExecutionRequirement,
  type ReportWorkbench,
  type WorkbenchAction,
  type WorkbenchMetrics,
  type WorkbenchReport,
} from "./types";

type JsonObject = Record<string, unknown>;
const isJsonObject = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const has = (value: JsonObject, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const nullableText = (value: unknown) => typeof value === "string" ? value : null;
const nullableNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const textList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const category = (value: unknown): ActionCategory | null => ACTION_CATEGORIES.includes(value as ActionCategory) ? value as ActionCategory : null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MONEY = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u;
const RATIO = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,8})?$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:z|([+-])(\d{2}):(\d{2}))$/iu;
const REPORT_BLOCKERS = new Set([null, "待补口径", "待确认归因"]);
const REPORT_STATUSES = new Set(["构建中", "校验中", "已发布", "失败", "已替代"]);
const REPORT_TYPES = new Set(["Keyword Report", "Sponsored Products Search Term Report"]);
const ACTION_STATUSES = new Set(["待执行", "观察中", "待复盘", "已复盘", "已关闭", "取消待确认", "已取消", "无需执行"]);
const ACTION_BLOCKERS = new Set([null, "待补基准", "归因未成熟", "执行要求待确认"]);
const EXECUTION_REQUIREMENTS = new Set(["actual_bid", "actual_budget", "actual_negative_action", "none"]);
const SCOPE_STATUSES = new Set(["已定位", "手工执行范围待确认", "已人工确认"]);
const REVIEW_STATUSES = new Set(["待补数据", "归因未成熟", "可提交", "已提交"]);
const MATURITY_STATUSES = new Set(["待补数据", "归因未成熟", "已成熟"]);
const SCOPE_KEYS = new Set(["campaign_id", "campaign_name", "ad_group_id", "ad_group_name", "target_id", "target_type", "match_type", "search_term", "target_expression", "source_locator"]);
const MONEY_FIELDS = ["current_spend", "current_sales", "current_avg_cpc", "risk_spend", "planned_up_amount", "planned_down_amount", "estimated_incremental_sales", "current_bid", "suggested_bid_low", "suggested_bid_high", "suggested_budget_or_test_cap", "actual_bid", "actual_budget"] as const;
const METRIC_FIELDS = ["current_spend", "current_sales", "planned_up_amount", "planned_down_amount", "risk_spend", "test_budget"] as const;
const REQUIRED_REVIEW_FIELDS = ["review_status", "comparable", "maturity_status", "blockers", "before_dataset_id", "after_dataset_id", "before_period_start", "before_period_end", "after_period_start", "after_period_end", "data_mature_at", "before_acos", "after_acos"] as const;

const requirement = (value: unknown): ExecutionRequirement => EXECUTION_REQUIREMENTS.has(String(value)) ? value as ExecutionRequirement : "none";
const validUuid = (value: unknown) => typeof value === "string" && UUID.test(value);
const validNullableUuid = (value: unknown) => value === null || validUuid(value);
const validNonempty = (value: unknown) => typeof value === "string" && value.trim() === value && value.length > 0;
const validNullableText = (value: unknown) => value === null || typeof value === "string";
const validMoney = (value: unknown) => typeof value === "string" && MONEY.test(value);
const validNullableMoney = (value: unknown) => value === null || validMoney(value);
const validRatio = (value: unknown) => typeof value === "string" && RATIO.test(value);
const validNullableRatio = (value: unknown) => value === null || validRatio(value);
const validNullableInteger = (value: unknown) => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
const validStringList = (value: unknown) => Array.isArray(value) && value.every(validNonempty);
const validIsoTime = (value: unknown) => {
  if (typeof value !== "string") return false;
  const match = ISO_TIME.exec(value);
  if (!match) return false;
  const offsetHour = match[2] === undefined ? 0 : Number(match[2]);
  const offsetMinute = match[3] === undefined ? 0 : Number(match[3]);
  return offsetHour <= 23 && offsetMinute <= 59 && Number.isFinite(Date.parse(value));
};
const validNullableIsoTime = (value: unknown) => value === null || validIsoTime(value);

function dateOrdinal(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day); const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? Math.floor(timestamp / 86_400_000) : null;
}

const validNullableDate = (value: unknown) => value === null || dateOrdinal(value) !== null;
function decimalAtMostOne(value: unknown) {
  if (!validRatio(value)) return false;
  const [whole, fraction = ""] = (value as string).split(".");
  return whole === "0" || (whole === "1" && /^0*$/u.test(fraction));
}

function validMetrics(value: unknown) {
  const metrics = object(value);
  return METRIC_FIELDS.every((field) => has(metrics, field) && validNullableMoney(metrics[field]));
}

function validReport(value: JsonObject) {
  const start = dateOrdinal(value.period_start); const end = dateOrdinal(value.period_end);
  const baseOperable = value.is_active_version === true && value.report_status === "已发布"
    && value.report_blocker === null && value.published_at !== null;
  return validUuid(value.report_id) && validUuid(value.task_id) && validUuid(value.workspace_id)
    && validUuid(value.created_by) && Number.isSafeInteger(value.version_number) && Number(value.version_number) > 0
    && validNonempty(value.asin) && value.marketplace === "US" && value.marketplace_timezone === "America/Los_Angeles"
    && value.currency === "USD" && REPORT_TYPES.has(String(value.report_type)) && start !== null && end !== null && end >= start
    && Number.isSafeInteger(value.period_days) && Number(value.period_days) === end - start + 1
    && decimalAtMostOne(value.target_acos) && !/^0(?:\.0+)?$/u.test(String(value.target_acos))
    && Number.isSafeInteger(value.attribution_days) && Number(value.attribution_days) > 0
    && validNonempty(value.attribution_metric_group) && validNonempty(value.analysis_version) && validNonempty(value.snapshot_version)
    && REPORT_BLOCKERS.has(value.report_blocker as string | null) && REPORT_STATUSES.has(String(value.report_status))
    && typeof value.is_active_version === "boolean" && typeof value.operable === "boolean"
    && (value.operable !== true || baseOperable)
    && Number.isSafeInteger(value.test_validation_days) && Number(value.test_validation_days) > 0
    && validIsoTime(value.created_at) && validNullableIsoTime(value.published_at) && validMetrics(value.metrics)
    && Array.isArray(value.workspace_members)
    && value.workspace_members.every((entry) => {
      const member = object(entry); return validUuid(member.user_id) && validNonempty(member.display_name);
    });
}

function validReview(value: unknown) {
  const review = object(value);
  const beforeStart = review.before_period_start === null ? null : dateOrdinal(review.before_period_start);
  const beforeEnd = review.before_period_end === null ? null : dateOrdinal(review.before_period_end);
  const afterStart = review.after_period_start === null ? null : dateOrdinal(review.after_period_start);
  const afterEnd = review.after_period_end === null ? null : dateOrdinal(review.after_period_end);
  const beforeEmpty = review.before_dataset_id === null && beforeStart === null && beforeEnd === null;
  const beforeComplete = validUuid(review.before_dataset_id) && beforeStart !== null && beforeEnd !== null
    && beforeEnd - beforeStart === 6;
  const afterEmpty = review.after_dataset_id === null && afterStart === null && afterEnd === null;
  const afterComplete = validUuid(review.after_dataset_id) && afterStart !== null && afterEnd !== null
    && afterEnd - afterStart === 6;
  return REQUIRED_REVIEW_FIELDS.every((field) => has(review, field))
    && REVIEW_STATUSES.has(String(review.review_status)) && typeof review.comparable === "boolean"
    && MATURITY_STATUSES.has(String(review.maturity_status)) && validStringList(review.blockers)
    && validNullableUuid(review.before_dataset_id) && validNullableUuid(review.after_dataset_id)
    && validNullableDate(review.before_period_start) && validNullableDate(review.before_period_end)
    && validNullableDate(review.after_period_start) && validNullableDate(review.after_period_end)
    && (beforeEmpty || beforeComplete) && (afterEmpty || afterComplete)
    && (!review.comparable || (beforeComplete && afterComplete && (afterStart as number) > (beforeEnd as number)))
    && validNullableIsoTime(review.data_mature_at) && validNullableRatio(review.before_acos)
    && validNullableRatio(review.after_acos);
}

function validCompetitors(value: unknown) {
  return Array.isArray(value) && value.every((entry) => {
    const detail = object(entry); return Object.keys(detail).every((key) => ["schema_version", "asin", "click_share", "note"].includes(key))
      && detail.schema_version === "competitor-detail-v1" && validNonempty(detail.asin)
      && validNullableRatio(detail.click_share) && validNullableText(detail.note);
  });
}

function validTrends(value: unknown) {
  return Array.isArray(value) && value.every((entry) => {
    const point = object(entry); return validNonempty(point.week) && validNonempty(point.demand);
  });
}

function validEvents(value: unknown) {
  return Array.isArray(value) && value.every((entry) => {
    const event = object(entry); return validNonempty(event.event_type) && validIsoTime(event.occurred_at)
      && validNullableText(event.actor_display_name) && validNullableText(event.reason);
  });
}

function validRankChecks(value: unknown, executedAt: unknown) {
  return Array.isArray(value) && value.every((entry) => {
    const rank = object(entry); const checked = validIsoTime(rank.checked_at) ? Date.parse(rank.checked_at as string) : NaN;
    if (rank.standard_version === 'xydc-daily-rank-v1') {
      return validUuid(rank.source_id) && rank.checked_at === null
        && typeof rank.observation_date === 'string' && validNullableDate(rank.observation_date)
        && rank.environment_label === 'XYDC / US / 历史日级趋势'
        && (rank.availability === 'unverified'
          ? ['待确认','已确认','处理中','结果待核对','失败'].includes(String(rank.request_status))
          : ['成功','已结算未采纳'].includes(String(rank.request_status)))
        && rank.post_execution === false && rank.completed_evidence === false
        && rank.day_semantics_state === 'provider_day_semantics_unverified' && validNonempty(rank.billing_state)
        && (rank.availability === 'ranked' ? Number.isSafeInteger(rank.natural_rank) && Number(rank.natural_rank)>0
          : ['no_data','unranked','unverified'].includes(String(rank.availability)) && rank.natural_rank === null);
    }
    const executed = validIsoTime(executedAt) ? Date.parse(executedAt as string) : NaN;
    const expectedPostExecution = Number.isFinite(executed) && checked > executed;
    const isXydc = rank.standard_version === "xydc-historical-rank-v1";
    const base = Number.isFinite(checked)
      && (rank.natural_rank === null || (Number.isSafeInteger(rank.natural_rank) && Number(rank.natural_rank) > 0))
      && validNonempty(rank.environment_label) && rank.post_execution === expectedPostExecution;
    if (!base) return false;
    if (isXydc) {
      return typeof rank.observation_date === "string" && validNullableDate(rank.observation_date)
        && rank.environment_label === "XYDC / US / 历史小时趋势"
        && typeof rank.billing_state === "string" && rank.billing_state !== ""
        && rank.completed_evidence === (rank.request_status === "成功" && rank.billing_state === "成功");
    }
    return rank.request_status === "成功" && rank.observation_date === null
      && rank.standard_version === "rank-quote-v1" && rank.billing_state === "旧版记录"
      && rank.completed_evidence === true && rank.environment_label !== "XYDC / US / 历史小时趋势";
  });
}

function validPlanShape(value: JsonObject) {
  if (value.action_blocker === "执行要求待确认") return value.execution_requirement === "none";
  switch (value.action_category) {
    case "增量放大": return value.planned_down_amount === null
      && value.suggested_budget_or_test_cap === null && value.execution_requirement === "actual_bid";
    case "止损整改":
    case "降投保护": return value.planned_up_amount === null
      && value.suggested_budget_or_test_cap === null
      && ["actual_bid", "actual_negative_action"].includes(String(value.execution_requirement));
    case "待测试": return value.planned_up_amount === null && value.planned_down_amount === null
      && value.execution_requirement === "actual_budget";
    case "暂不处理": return value.suggested_budget_or_test_cap === null && value.execution_requirement === "none"
      && [null, "0", "0.000000"].includes(value.planned_up_amount as string | null)
      && [null, "0", "0.000000"].includes(value.planned_down_amount as string | null);
    default: return false;
  }
}

function validAction(value: JsonObject, reportOperable: boolean) {
  const scope = object(value.execution_scope);
  return validUuid(value.action_item_id) && validUuid(value.report_row_id)
    && validNullableUuid(value.owner_user_id) && validNullableText(value.owner_display_name)
    && validNullableText(value.external_owner_name) && validNullableDate(value.planned_execution_date)
    && validNullableIsoTime(value.executed_at) && validNullableIsoTime(value.review_due_at)
    && ACTION_CATEGORIES.includes(value.action_category as ActionCategory) && ACTION_STATUSES.has(String(value.action_status))
    && ACTION_BLOCKERS.has(value.action_blocker as string | null) && validNullableText(value.review_result)
    && typeof value.operable === "boolean" && (value.operable !== true || (reportOperable && value.action_blocker === null
      && ["已定位", "已人工确认"].includes(String(value.execution_scope_status))))
    && validNonempty(value.keyword) && validNonempty(value.normalized_keyword)
    && validNullableInteger(value.current_clicks) && validNullableInteger(value.current_orders)
    && MONEY_FIELDS.every((field) => validNullableMoney(value[field])) && validNullableRatio(value.current_acos)
    && typeof value.sample_sufficient === "boolean" && validNullableText(value.reason)
    && validStringList(value.evidence) && validNullableText(value.guardrail) && validStringList(value.data_quality_flags)
    && validNullableText(value.campaign_id) && validNullableText(value.campaign_name)
    && validNullableText(value.ad_group_id) && validNullableText(value.ad_group_name)
    && validNullableText(value.target_id) && validNullableText(value.target_type) && validNullableText(value.match_type)
    && validNullableText(value.search_term) && validNullableText(value.target_expression)
    && isJsonObject(value.execution_scope)
    && Object.entries(scope).every(([key, item]) => SCOPE_KEYS.has(key) && validNonempty(item))
    && (value.execution_scope_status === "手工执行范围待确认" || Object.keys(scope).length > 0)
    && SCOPE_STATUSES.has(String(value.execution_scope_status)) && EXECUTION_REQUIREMENTS.has(String(value.execution_requirement))
    && validPlanShape(value) && validNullableText(value.actual_negative_action) && validCompetitors(value.competitor_details)
    && validTrends(value.trend_13_weeks) && validStringList(value.data_sources) && validEvents(value.events)
    && validRankChecks(value.rank_checks, value.executed_at) && typeof value.rank_double_drop_alert === "boolean"
    && validReview(value.review);
}

function normalizeReview(value: unknown): ActionReview {
  const item = object(value);
  return {
    reviewStatus: nullableText(item.review_status), comparable: item.comparable === true,
    maturityStatus: nullableText(item.maturity_status), blockers: textList(item.blockers),
    beforeDatasetId: nullableText(item.before_dataset_id), afterDatasetId: nullableText(item.after_dataset_id),
    beforePeriodStart: nullableText(item.before_period_start), beforePeriodEnd: nullableText(item.before_period_end),
    afterPeriodStart: nullableText(item.after_period_start), afterPeriodEnd: nullableText(item.after_period_end),
    dataMatureAt: nullableText(item.data_mature_at), beforeAcos: nullableText(item.before_acos), afterAcos: nullableText(item.after_acos),
  };
}

function safeExecutionScope(value: unknown) {
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(object(value))) if (SCOPE_KEYS.has(key) && typeof item === "string") result[key] = item;
  return result;
}

function normalizeAction(value: unknown, complete: boolean): WorkbenchAction {
  const item = object(value);
  return {
    actionItemId: text(item.action_item_id), reportRowId: text(item.report_row_id),
    ownerUserId: nullableText(item.owner_user_id), ownerDisplayName: nullableText(item.owner_display_name),
    externalOwnerName: nullableText(item.external_owner_name), plannedExecutionDate: nullableText(item.planned_execution_date),
    executedAt: nullableText(item.executed_at), reviewDueAt: nullableText(item.review_due_at), actionStatus: text(item.action_status, "待执行"),
    actionBlocker: nullableText(item.action_blocker), reviewResult: nullableText(item.review_result), operable: complete && item.operable === true,
    keyword: text(item.keyword, "未命名关键词"), normalizedKeyword: text(item.normalized_keyword), actionCategory: category(item.action_category),
    currentClicks: nullableNumber(item.current_clicks), currentOrders: nullableNumber(item.current_orders), currentSpend: nullableText(item.current_spend),
    currentSales: nullableText(item.current_sales), currentAvgCpc: nullableText(item.current_avg_cpc), currentAcos: nullableText(item.current_acos),
    riskSpend: nullableText(item.risk_spend), plannedUpAmount: nullableText(item.planned_up_amount), plannedDownAmount: nullableText(item.planned_down_amount),
    estimatedIncrementalSales: nullableText(item.estimated_incremental_sales), sampleSufficient: item.sample_sufficient === true,
    reason: nullableText(item.reason), evidence: textList(item.evidence), guardrail: nullableText(item.guardrail), dataQualityFlags: textList(item.data_quality_flags),
    campaignId: nullableText(item.campaign_id), campaignName: nullableText(item.campaign_name), adGroupId: nullableText(item.ad_group_id),
    adGroupName: nullableText(item.ad_group_name), targetId: nullableText(item.target_id), targetType: nullableText(item.target_type),
    matchType: nullableText(item.match_type), searchTerm: nullableText(item.search_term), targetExpression: nullableText(item.target_expression),
    currentBid: nullableText(item.current_bid), executionScope: safeExecutionScope(item.execution_scope),
    executionScopeStatus: text(item.execution_scope_status, "手工执行范围待确认"), executionRequirement: requirement(item.execution_requirement),
    suggestedBidLow: nullableText(item.suggested_bid_low), suggestedBidHigh: nullableText(item.suggested_bid_high),
    suggestedBudgetOrTestCap: nullableText(item.suggested_budget_or_test_cap), actualBid: nullableText(item.actual_bid),
    actualBudget: nullableText(item.actual_budget), actualNegativeAction: nullableText(item.actual_negative_action),
    competitorDetails: Array.isArray(item.competitor_details) ? item.competitor_details.map((entry) => {
      const detail = object(entry); return { asin: text(detail.asin), clickShare: nullableText(detail.click_share), note: nullableText(detail.note) };
    }).filter((entry) => entry.asin !== "") : [],
    trend13Weeks: Array.isArray(item.trend_13_weeks) ? item.trend_13_weeks.map((entry) => {
      const point = object(entry); return { week: text(point.week), demand: text(point.demand) };
    }).filter((entry) => entry.week !== "") : [],
    dataSources: textList(item.data_sources),
    events: Array.isArray(item.events) ? item.events.map((entry) => {
      const event = object(entry); return { eventType: text(event.event_type), occurredAt: text(event.occurred_at), actorDisplayName: nullableText(event.actor_display_name), reason: nullableText(event.reason) };
    }).filter((entry) => entry.eventType !== "") : [],
    rankChecks: Array.isArray(item.rank_checks) ? item.rank_checks.map((entry) => {
      const check = object(entry); return {
        requestStatus: text(check.request_status), checkedAt: nullableText(check.checked_at), observationDate: nullableText(check.observation_date),
        observationId: nullableText(check.source_id), availability: nullableText(check.availability), daySemanticsState: nullableText(check.day_semantics_state),
        naturalRank: nullableNumber(check.natural_rank), environmentLabel: text(check.environment_label), postExecution: check.post_execution === true,
        billingState: nullableText(check.billing_state), standardVersion: nullableText(check.standard_version), completedEvidence: check.completed_evidence === true,
      };
    }) : [],
    rankDoubleDropAlert: complete && item.rank_double_drop_alert === true,
    review: normalizeReview(item.review),
  };
}

const REQUIRED_REPORT_FIELDS = ["report_id", "task_id", "version_number", "workspace_id", "created_by", "asin", "marketplace", "marketplace_timezone", "currency", "report_type", "period_start", "period_end", "period_days", "target_acos", "attribution_days", "attribution_metric_group", "analysis_version", "snapshot_version", "report_status", "report_blocker", "is_active_version", "operable", "test_validation_days", "workspace_members", "metrics", "created_at", "published_at"];
const REQUIRED_ACTION_FIELDS = ["action_item_id", "report_row_id", "owner_user_id", "owner_display_name", "external_owner_name", "planned_execution_date", "executed_at", "review_due_at", "action_status", "action_blocker", "review_result", "operable", "keyword", "normalized_keyword", "action_category", "current_clicks", "current_orders", "current_spend", "current_sales", "current_avg_cpc", "current_acos", "risk_spend", "planned_up_amount", "planned_down_amount", "estimated_incremental_sales", "sample_sufficient", "reason", "evidence", "guardrail", "data_quality_flags", "campaign_id", "campaign_name", "ad_group_id", "ad_group_name", "target_id", "target_type", "match_type", "search_term", "target_expression", "current_bid", "execution_scope", "execution_scope_status", "execution_requirement", "suggested_bid_low", "suggested_bid_high", "suggested_budget_or_test_cap", "actual_bid", "actual_budget", "actual_negative_action", "competitor_details", "trend_13_weeks", "data_sources", "events", "rank_checks", "rank_double_drop_alert", "review"];

function normalizeMetrics(value: unknown): WorkbenchMetrics {
  const item = object(value);
  return {
    currentSpend: nullableText(item.current_spend), currentSales: nullableText(item.current_sales),
    plannedUpAmount: nullableText(item.planned_up_amount), plannedDownAmount: nullableText(item.planned_down_amount),
    riskSpend: nullableText(item.risk_spend), testBudget: nullableText(item.test_budget),
  };
}

function normalizeReport(value: JsonObject, complete: boolean): WorkbenchReport {
  return {
    reportId: text(value.report_id), taskId: text(value.task_id), versionNumber: nullableNumber(value.version_number) ?? 0,
    workspaceId: text(value.workspace_id), createdBy: text(value.created_by), asin: text(value.asin), marketplace: "US",
    marketplaceTimezone: "America/Los_Angeles", currency: "USD", reportType: text(value.report_type),
    periodStart: nullableText(value.period_start), periodEnd: nullableText(value.period_end), periodDays: nullableNumber(value.period_days),
    targetAcos: nullableText(value.target_acos), attributionDays: nullableNumber(value.attribution_days),
    attributionMetricGroup: nullableText(value.attribution_metric_group), analysisVersion: text(value.analysis_version),
    snapshotVersion: text(value.snapshot_version), reportStatus: text(value.report_status),
    reportBlocker: complete ? nullableText(value.report_blocker) : "待补口径", isActiveVersion: value.is_active_version === true,
    operable: complete && value.operable === true, testValidationDays: nullableNumber(value.test_validation_days) ?? 14,
    workspaceMembers: Array.isArray(value.workspace_members) ? value.workspace_members.map((entry) => {
      const member = object(entry); return { userId: text(member.user_id), displayName: text(member.display_name) };
    }).filter((member) => member.userId !== "" && member.displayName !== "") : [],
    metrics: normalizeMetrics(value.metrics), createdAt: nullableText(value.created_at), publishedAt: nullableText(value.published_at),
  };
}

export function normalizeWorkbenchPayload(value: unknown): ReportWorkbench {
  const payload = object(value); const reportValue = object(payload.report);
  const actionValues = Array.isArray(payload.actions) ? payload.actions.map(object) : [];
  const reportValid = REQUIRED_REPORT_FIELDS.every((key) => has(reportValue, key)) && validReport(reportValue);
  const contractComplete = payload.contract_version === "report-workbench-v5" && reportValid
    && Array.isArray(payload.actions) && actionValues.every((entry) => REQUIRED_ACTION_FIELDS.every((key) => has(entry, key))
      && validAction(entry, reportValue.operable === true));
  return { contractComplete, report: normalizeReport(reportValue, contractComplete), actions: actionValues.map((entry) => normalizeAction(entry, contractComplete)) };
}

export function hasValidReportPeriod(report: WorkbenchReport) {
  if (report.periodStart === null || report.periodEnd === null || report.periodDays === null
    || !Number.isSafeInteger(report.periodDays) || report.periodDays < 1) return false;
  const start = dateOrdinal(report.periodStart); const end = dateOrdinal(report.periodEnd);
  return start !== null && end !== null && end >= start && end - start + 1 === report.periodDays;
}

export function shouldMaskWorkbenchAmounts(workbench: ReportWorkbench) {
  const { report } = workbench;
  const acceptedAmounts = report.reportStatus === "已替代"
    || (report.reportStatus === "已发布" && report.operable);
  return !workbench.contractComplete || !acceptedAmounts || report.reportBlocker !== null
    || !hasValidReportPeriod(report);
}
