import type { ApiService, RankCheckQuote, ReviewDatasetPreflight, ReviewDatasetRole, SnapshotUrlResponse } from "../lib/api";
import type { SupabaseSubmissionService, SupabaseWorkbenchService } from "../lib/supabase";

export interface WorkbenchPageServices {
  getTaskCostSummary(taskId: string): Promise<unknown>;
  resolveActiveReportId(taskId: string): Promise<string>;
  getReportWorkbench(reportId: string): Promise<unknown>;
  assignActionOwner: SupabaseWorkbenchService["assignActionOwner"];
  confirmActionScope: SupabaseWorkbenchService["confirmActionScope"];
  markActionExecuted: SupabaseWorkbenchService["markActionExecuted"];
  submitActionReview: SupabaseWorkbenchService["submitActionReview"];
  requestActionCancel: SupabaseWorkbenchService["requestActionCancel"];
  confirmActionCancel: SupabaseWorkbenchService["confirmActionCancel"];
  closeAction: SupabaseWorkbenchService["closeAction"];
  confirmReviewDataset: SupabaseWorkbenchService["confirmReviewDataset"];
  preflightReviewDataset(input: { workspaceId: string; reportId: string; actionItemId: string; datasetRole: ReviewDatasetRole; file: File }): Promise<ReviewDatasetPreflight>;
  requestSnapshotUrl(reportId: string): Promise<SnapshotUrlResponse>;
  createRankCheckQuote(actionItemId: string, observationDate: string): Promise<RankCheckQuote>;
  confirmRankCheckRequest: SupabaseWorkbenchService["confirmRankCheckRequest"];
}

export function createWorkbenchPageServices({
  api,
  submission,
  workbench,
  hashFile,
  createIdempotencyKey,
}: {
  api: ApiService;
  submission: SupabaseSubmissionService;
  workbench: SupabaseWorkbenchService;
  hashFile: (file: File) => Promise<string>;
  createIdempotencyKey: () => string;
}): WorkbenchPageServices {
  const pendingRankQuoteKeys = new Map<string, string>();
  return {
    ...workbench,
    async resolveActiveReportId(taskId) {
      const reports = await workbench.listMyReports();
      const match = reports.find((report) => report.task_id === taskId && report.is_active_version === true);
      if (!match) throw new Error("ACTIVE_REPORT_NOT_READY");
      return match.report_id;
    },
    async preflightReviewDataset({ workspaceId, reportId, actionItemId, datasetRole, file }) {
      const fileHash = await hashFile(file);
      const session = await api.createUploadSession({
        workspaceId,
        originalFilename: file.name,
        fileHash,
        uploadPurpose: "复盘数据",
      });
      await submission.uploadToSignedUrl({
        bucket: session.bucket,
        path: session.path,
        token: session.token,
        file,
        upsert: false,
      });
      return api.runReviewDatasetPreflight({ sessionId: session.sessionId, reportId, actionItemId, datasetRole });
    },
    requestSnapshotUrl: (reportId) => api.requestSnapshotUrl(reportId),
    async createRankCheckQuote(actionItemId, observationDate) {
      const pendingKey = `xydc-daily-rank-v1:${actionItemId}:${observationDate}`;
      const idempotencyKey = pendingRankQuoteKeys.get(pendingKey) ?? createIdempotencyKey();
      pendingRankQuoteKeys.set(pendingKey, idempotencyKey);
      const quote = await api.createRankCheckQuote({ actionItemId, idempotencyKey, observationDate });
      pendingRankQuoteKeys.delete(pendingKey);
      return quote;
    },
  };
}
