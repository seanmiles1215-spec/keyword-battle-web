import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SubmissionError } from "./api";
import type { ManualExecutionScope } from "../workbench/types";

export interface AuthSession {
  accessToken: string;
  user: { id: string; email?: string };
}

export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  onAuthStateChange(listener: (session: AuthSession | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface SetPreflightParametersInput {
  sessionId: string;
  periodStart: string;
  periodEnd: string;
  marketplace: "US";
  currency: "USD";
  reportType: string;
  attributionDays: number;
  attributionMetricGroup: string;
  targetAcos: string;
}

export interface ConfirmKeywordTaskInput {
  sessionId: string;
  fileHash: string;
  preflightHash: string;
  idempotencyKey: string;
  asin: string;
  analysisVersion: string;
  snapshotVersion: string;
  quoteId: string;
  quoteHash: string;
}

export interface SupabaseSubmissionService {
  uploadToSignedUrl(input: {
    bucket: string;
    path: string;
    token: string;
    file: File;
    upsert: false;
  }): Promise<void>;
  setPreflightParameters(input: SetPreflightParametersInput): Promise<string>;
  confirmKeywordTask(input: ConfirmKeywordTaskInput): Promise<string>;
  cancelUploadSession(sessionId: string): Promise<void>;
}

export interface SupabaseWorkbenchService {
  getTaskCostSummary(taskId: string): Promise<unknown>;
  listMyReports(): Promise<Array<{ report_id: string; task_id: string; is_active_version: boolean }>>;
  getReportWorkbench(reportId: string): Promise<unknown>;
  assignActionOwner(input: { actionItemId: string; ownerUserId: string; plannedExecutionDate: string }): Promise<boolean>;
  confirmActionScope(input: { actionItemId: string } & ManualExecutionScope): Promise<boolean>;
  markActionExecuted(input: { actionItemId: string; actualBid: string | null; actualBudget: string | null; actualNegativeAction: string | null }): Promise<boolean>;
  submitActionReview(input: { actionItemId: string; beforeDatasetId: string; afterDatasetId: string; reviewResult: string }): Promise<boolean>;
  requestActionCancel(input: { actionItemId: string; reason: string }): Promise<boolean>;
  confirmActionCancel(actionItemId: string): Promise<boolean>;
  closeAction(actionItemId: string): Promise<boolean>;
  confirmReviewDataset(reviewDatasetId: string): Promise<boolean>;
  confirmRankCheckRequest(input: { requestId: string; idempotencyKey: string }): Promise<boolean>;
}

function normalizeSession(session: { access_token: string; user: { id: string; email?: string } } | null) {
  return session ? {
    accessToken: session.access_token,
    user: { id: session.user.id, ...(session.user.email ? { email: session.user.email } : {}) },
  } : null;
}

function classifiedRpcError(
  error: unknown,
  transportCode: string,
  transportAmbiguous: boolean,
) {
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown } | null;
  const message = typeof candidate?.message === "string" ? candidate.message : "RPC_FAILED";
  const status = Number(candidate?.status);
  const rawCode = typeof candidate?.code === "string" ? candidate.code.trim() : "";
  const code = rawCode || "RPC_FAILED";
  if (status === 0 || rawCode === "FETCH_ERROR"
    || /failed to fetch|fetch failed|networkerror|load failed/iu.test(message)) {
    return new SubmissionError(transportCode, "network", transportAmbiguous);
  }
  if (status === 401 || code === "PGRST301" || /jwt|authenti/iu.test(message)) {
    return new SubmissionError("UNAUTHENTICATED", "unauthenticated", false);
  }
  if (status === 403 || code === "42501"
    || /permission|workspace membership|access denied|only the uploader/iu.test(message)) {
    return new SubmissionError("FORBIDDEN", "forbidden", false);
  }
  if (code === "55000" && /expired|not confirmable|not editable|not cancellable/iu.test(message)) {
    return new SubmissionError(code, "expired", false);
  }
  if (/PREFLIGHT_BLOCKED|PARAMETERS_REQUIRED/u.test(code)
    || /attribution context is incomplete|confirmed preflight context is incomplete/iu.test(message)) {
    return new SubmissionError(code, "needs_parameters", false);
  }
  if (/^(?:08|53|54|57|58|XX)/u.test(code)) {
    return new SubmissionError(code, "network", false);
  }
  return new SubmissionError(code, status >= 500 ? "network" : "validation", false);
}

async function transportBound<T>(
  operation: () => PromiseLike<T>,
  code: string,
  ambiguous: boolean,
) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SubmissionError) throw error;
    throw new SubmissionError(code, "network", ambiguous);
  }
}

export function createSupabaseServices({
  supabaseUrl,
  publishableKey,
  client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }),
}: {
  supabaseUrl: string;
  publishableKey: string;
  client?: SupabaseClient;
}): { auth: AuthService; supabase: SupabaseSubmissionService; workbench: SupabaseWorkbenchService; getAccessToken: () => Promise<string | null> } {
  const auth: AuthService = {
    async getSession() {
      const { data, error } = await transportBound(
        () => client.auth.getSession(),
        "AUTH_TRANSPORT_FAILURE",
        false,
      );
      if (error) throw classifiedRpcError(error, "AUTH_TRANSPORT_FAILURE", false);
      return normalizeSession(data.session);
    },
    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, nextSession) => listener(normalizeSession(nextSession)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await transportBound(
        () => client.auth.signInWithPassword({ email, password }),
        "AUTH_TRANSPORT_FAILURE",
        false,
      );
      if (error) throw classifiedRpcError(error, "AUTH_TRANSPORT_FAILURE", false);
    },
    async signUp(email, password) {
      const { error } = await transportBound(
        () => client.auth.signUp({ email, password }),
        "AUTH_TRANSPORT_FAILURE",
        false,
      );
      if (error) throw classifiedRpcError(error, "AUTH_TRANSPORT_FAILURE", false);
    },
    async signOut() {
      const { error } = await transportBound(
        () => client.auth.signOut(),
        "AUTH_TRANSPORT_FAILURE",
        false,
      );
      if (error) throw classifiedRpcError(error, "AUTH_TRANSPORT_FAILURE", false);
    },
  };

  const supabase: SupabaseSubmissionService = {
    async uploadToSignedUrl({ bucket, path, token, file, upsert }) {
      if (upsert !== false) throw new SubmissionError("UPSERT_FORBIDDEN", "validation");
      const { error } = await transportBound(
        () => client.storage.from(bucket).uploadToSignedUrl(path, token, file, {
          upsert: false,
          contentType: file.type || undefined,
        }),
        "UPLOAD_TRANSPORT_FAILURE",
        false,
      );
      if (error) throw classifiedRpcError(error, "UPLOAD_TRANSPORT_FAILURE", false);
    },
    async setPreflightParameters(input) {
      const { data, error } = await transportBound(
        () => client.rpc("set_preflight_parameters", {
          p_upload_session_id: input.sessionId,
          p_period_start: input.periodStart,
          p_period_end: input.periodEnd,
          p_marketplace: input.marketplace,
          p_currency: input.currency,
          p_report_type: input.reportType,
          p_attribution_days: input.attributionDays,
          p_attribution_metric_group: input.attributionMetricGroup,
          p_target_acos: input.targetAcos,
        }),
        "PARAMETER_TRANSPORT_FAILURE",
        false,
      );
      if (error) throw classifiedRpcError(error, "PARAMETER_TRANSPORT_FAILURE", false);
      if (typeof data !== "string" || !/^[0-9a-f]{64}$/u.test(data)) {
        throw new SubmissionError("INVALID_RPC_RESPONSE", "network");
      }
      return data;
    },
    async confirmKeywordTask(input) {
      const { data, error } = await transportBound(
        () => client.rpc("confirm_keyword_task_v3", {
          p_upload_session_id: input.sessionId,
          p_file_hash: input.fileHash,
          p_preflight_hash: input.preflightHash,
          p_idempotency_key: input.idempotencyKey,
          p_asin: input.asin,
          p_analysis_version: input.analysisVersion,
          p_snapshot_version: input.snapshotVersion,
          p_quote_id: input.quoteId,
          p_quote_hash: input.quoteHash,
        }),
        "CONFIRMATION_TRANSPORT_LOST",
        true,
      );
      if (error) throw classifiedRpcError(error, "CONFIRMATION_TRANSPORT_LOST", true);
      if (typeof data !== "string" || data === "") throw new SubmissionError("CONFIRMATION_OUTCOME_UNKNOWN", "network", true);
      return data;
    },
    async cancelUploadSession(sessionId) {
      const { data, error } = await transportBound(
        () => client.rpc("cancel_upload_session", {
          p_upload_session_id: sessionId,
        }),
        "CANCEL_TRANSPORT_FAILURE",
        false,
      );
      if (error) throw classifiedRpcError(error, "CANCEL_TRANSPORT_FAILURE", false);
      if (data !== true) throw new SubmissionError("CANCEL_REJECTED", "validation");
    },
  };

  async function controlledRpc(name: string, args?: Record<string, unknown>) {
    const { data, error } = await transportBound(
      () => client.rpc(name, args),
      "WORKBENCH_TRANSPORT_FAILURE",
      true,
    );
    if (error) throw classifiedRpcError(error, "WORKBENCH_TRANSPORT_FAILURE", true);
    return data;
  }

  async function booleanRpc(name: string, args: Record<string, unknown>) {
    const data = await controlledRpc(name, args);
    if (data !== true) throw new SubmissionError("WORKBENCH_OPERATION_REJECTED", "validation");
    return true;
  }

  const workbench: SupabaseWorkbenchService = {
    getTaskCostSummary: (taskId) => controlledRpc('get_my_task_cost_summary_v1', { p_task_id: taskId }),
    async listMyReports() {
      const data = await controlledRpc("list_my_reports");
      if (!Array.isArray(data)) throw new SubmissionError("INVALID_RPC_RESPONSE", "network");
      return data as Array<{ report_id: string; task_id: string; is_active_version: boolean }>;
    },
    async getReportWorkbench(reportId) {
      return controlledRpc("get_report_workbench_v5", { p_report_id: reportId });
    },
    assignActionOwner: (input) => booleanRpc("assign_action_owner_v2", {
      p_action_item_id: input.actionItemId,
      p_owner_user_id: input.ownerUserId,
      p_planned_execution_date: input.plannedExecutionDate,
    }),
    confirmActionScope: (input) => booleanRpc("confirm_action_scope_v2", {
      p_action_item_id: input.actionItemId,
      p_campaign_id: input.campaignId,
      p_ad_group_id: input.adGroupId,
      p_target_id: input.targetId,
      p_target_type: input.targetType,
      p_match_type: input.matchType,
      p_search_term: input.searchTerm,
      p_target_expression: input.targetExpression,
      p_source_locator: input.sourceLocator,
    }),
    markActionExecuted: (input) => booleanRpc("mark_action_executed_v2", {
      p_action_item_id: input.actionItemId,
      p_actual_bid: input.actualBid,
      p_actual_budget: input.actualBudget,
      p_actual_negative_action: input.actualNegativeAction,
    }),
    submitActionReview: (input) => booleanRpc("submit_action_review_v2", {
      p_action_item_id: input.actionItemId,
      p_before_dataset_id: input.beforeDatasetId,
      p_after_dataset_id: input.afterDatasetId,
      p_review_result: input.reviewResult,
    }),
    requestActionCancel: (input) => booleanRpc("request_action_cancel_v2", {
      p_action_item_id: input.actionItemId,
      p_reason: input.reason,
    }),
    confirmActionCancel: (actionItemId) => booleanRpc("confirm_action_cancel_v2", { p_action_item_id: actionItemId }),
    closeAction: (actionItemId) => booleanRpc("close_action_v2", { p_action_item_id: actionItemId }),
    confirmReviewDataset: (reviewDatasetId) => booleanRpc("confirm_review_dataset_v2", { p_review_dataset_id: reviewDatasetId }),
    confirmRankCheckRequest: (input) => booleanRpc("confirm_daily_rank_check_request_v1", {
      p_request_id: input.requestId,
      p_client_idempotency_key: input.idempotencyKey,
    }),
  };

  return {
    auth,
    supabase,
    workbench,
    async getAccessToken() {
      return (await auth.getSession())?.accessToken ?? null;
    },
  };
}
