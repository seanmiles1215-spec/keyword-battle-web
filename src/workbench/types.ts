export const ACTION_CATEGORIES = ["止损整改", "增量放大", "待测试", "降投保护", "暂不处理"] as const;
export type ActionCategory = typeof ACTION_CATEGORIES[number];
export type WorkbenchFilter = "all" | ActionCategory | "stop-loss";
export type ExecutionRequirement = "actual_bid" | "actual_budget" | "actual_negative_action" | "none";
export interface TaskProviderCost {
  provider: '豆包' | '西柚'; currencyOrUnit: 'USD' | 'CNY' | 'credits';
  estimatedCost: string | null; lockedCap: string; confirmedActual: string; unresolvedReserved: string;
  pendingCount: number; uncertainCount: number; overCap: boolean;
}
export interface TaskCostSummaryData {
  taskId: string; taskStatus: string; reportId: string | null; publicationReady: boolean; providers: TaskProviderCost[];
}

export interface WorkspaceMember { userId: string; displayName: string; }
export interface WorkbenchMetrics {
  currentSpend: string | null; currentSales: string | null; plannedUpAmount: string | null;
  plannedDownAmount: string | null; riskSpend: string | null; testBudget: string | null;
}

export interface WorkbenchReport {
  reportId: string; taskId: string; versionNumber: number; workspaceId: string; createdBy: string;
  asin: string; marketplace: "US"; marketplaceTimezone: "America/Los_Angeles"; currency: "USD";
  reportType: string; periodStart: string | null; periodEnd: string | null; periodDays: number | null;
  targetAcos: string | null; attributionDays: number | null; attributionMetricGroup: string | null;
  analysisVersion: string; snapshotVersion: string; reportStatus: string; reportBlocker: string | null;
  isActiveVersion: boolean; operable: boolean; testValidationDays: number; workspaceMembers: WorkspaceMember[];
  metrics: WorkbenchMetrics; createdAt: string | null; publishedAt: string | null;
}

export interface CompetitorDetail { asin: string; clickShare: string | null; note: string | null; }
export interface TrendPoint { week: string; demand: string; }
export interface ActionEvent { eventType: string; occurredAt: string; actorDisplayName: string | null; reason: string | null; }
export interface RankCheck {
  requestStatus: string; checkedAt: string | null; observationDate: string | null; naturalRank: number | null;
  observationId?: string | null; availability?: string | null; daySemanticsState?: string | null;
  environmentLabel: string; postExecution: boolean; billingState: string | null;
  standardVersion: string | null; completedEvidence: boolean;
}
export interface RankCheckQuote {
  requestId: string; actionItemId: string; idempotencyKey: string; estimatedCredits: string;
  observationDate: string; environmentLabel: string; quoteVersion: "rank-quote-xydc-daily-v1";
  standardVersion: "xydc-daily-rank-v1"; requestStatus: "待确认";
}

export interface ActionReview {
  reviewStatus: string | null; comparable: boolean; maturityStatus: string | null; blockers: string[];
  beforeDatasetId: string | null; afterDatasetId: string | null;
  beforePeriodStart: string | null; beforePeriodEnd: string | null;
  afterPeriodStart: string | null; afterPeriodEnd: string | null;
  dataMatureAt: string | null; beforeAcos: string | null; afterAcos: string | null;
}

export interface WorkbenchAction {
  actionItemId: string; reportRowId: string; ownerUserId: string | null; ownerDisplayName: string | null;
  externalOwnerName: string | null; plannedExecutionDate: string | null; executedAt: string | null;
  reviewDueAt: string | null; actionStatus: string; actionBlocker: string | null; reviewResult: string | null;
  operable: boolean;
  keyword: string; normalizedKeyword: string; actionCategory: ActionCategory | null;
  currentClicks: number | null; currentOrders: number | null; currentSpend: string | null; currentSales: string | null;
  currentAvgCpc: string | null; currentAcos: string | null; riskSpend: string | null;
  plannedUpAmount: string | null; plannedDownAmount: string | null; estimatedIncrementalSales: string | null;
  sampleSufficient: boolean; reason: string | null; evidence: string[]; guardrail: string | null;
  dataQualityFlags: string[]; campaignId: string | null; campaignName: string | null;
  adGroupId: string | null; adGroupName: string | null; targetId: string | null; targetType: string | null;
  matchType: string | null; searchTerm: string | null; targetExpression: string | null; currentBid: string | null;
  executionScope: Record<string, string>; executionScopeStatus: string; executionRequirement: ExecutionRequirement;
  suggestedBidLow: string | null; suggestedBidHigh: string | null; suggestedBudgetOrTestCap: string | null;
  actualBid: string | null; actualBudget: string | null; actualNegativeAction: string | null;
  competitorDetails: CompetitorDetail[]; trend13Weeks: TrendPoint[]; dataSources: string[];
  events: ActionEvent[]; rankChecks: RankCheck[]; rankDoubleDropAlert: boolean; review: ActionReview;
}

export interface ReportWorkbench { contractComplete: boolean; report: WorkbenchReport; actions: WorkbenchAction[]; }
export interface ActionPermissions {
  canAssignOwner: boolean; canConfirmScope: boolean; canExecute: boolean;
  canViewReview: boolean; canUploadReview: boolean; canSubmitReview: boolean;
  canRequestCancel: boolean; canConfirmCancel: boolean; canClose: boolean;
  canRequestRankCheck: boolean;
}
export interface ExecutionValues { actualBid: string | null; actualBudget: string | null; actualNegativeAction: string | null; }
export interface ManualExecutionScope {
  campaignId: string; adGroupId: string; targetId: string; targetType: string;
  matchType: string | null; searchTerm: string | null; targetExpression: string | null;
  sourceLocator: string;
}

export interface WorkbenchOperations {
  assignOwner(action: WorkbenchAction, ownerUserId?: string, plannedExecutionDate?: string): void;
  confirmScope(action: WorkbenchAction, executionScope?: ManualExecutionScope): void;
  execute(action: WorkbenchAction, values?: ExecutionValues): void; submitReview(action: WorkbenchAction, reviewResult: string): void;
  requestCancel(action: WorkbenchAction, reason?: string): void; confirmCancel(action: WorkbenchAction): void;
  close(action: WorkbenchAction): void;
  preflightReviewDataset(action: WorkbenchAction, role: "执行前基准" | "执行后结果", file: File): void;
  downloadSnapshot(): void;
  quoteRankCheck(action: WorkbenchAction, observationDate: string): Promise<RankCheckQuote>;
  confirmRankCheck(action: WorkbenchAction, quote: RankCheckQuote): void;
}

export function actionPermissions(data: ReportWorkbench, action: WorkbenchAction, viewerUserId: string): ActionPermissions {
  const active = data.contractComplete && data.report.operable;
  const mutable = active && action.operable;
  const creator = data.report.createdBy === viewerUserId;
  const owner = action.ownerUserId === viewerUserId;
  const open = ["待执行", "观察中", "待复盘"].includes(action.actionStatus);
  return {
    canAssignOwner: mutable && creator && data.report.workspaceMembers.length > 0
      && ["待执行", "观察中", "待复盘"].includes(action.actionStatus),
    canConfirmScope: active && (creator || owner) && action.actionStatus === "待执行"
      && action.executionScopeStatus === "手工执行范围待确认",
    canExecute: mutable && owner && action.actionStatus === "待执行"
      && action.executionScopeStatus !== "手工执行范围待确认" && action.executionRequirement !== "none",
    canViewReview: creator || owner,
    canUploadReview: mutable && (creator || owner) && ["观察中", "待复盘"].includes(action.actionStatus),
    canSubmitReview: mutable && owner && action.actionStatus === "待复盘"
      && action.review.reviewStatus === "可提交" && action.review.comparable
      && action.review.maturityStatus === "已成熟" && action.review.blockers.length === 0,
    canRequestCancel: mutable && owner && open,
    canConfirmCancel: mutable && creator && action.actionStatus === "取消待确认",
    canClose: active && creator && action.actionStatus === "已复盘" && action.review.reviewStatus === "已提交",
    canRequestRankCheck: mutable && (creator || owner) && action.executedAt !== null
      && ["观察中", "待复盘", "已复盘"].includes(action.actionStatus)
      && ["已定位", "已人工确认"].includes(action.executionScopeStatus),
  };
}

export function actionMatchesFilter(action: WorkbenchAction, filter: WorkbenchFilter) {
  if (filter === "all") return true;
  if (filter === "stop-loss") return action.actionCategory === "止损整改" || action.actionCategory === "降投保护";
  return action.actionCategory === filter;
}
