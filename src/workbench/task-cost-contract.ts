import type { TaskCostSummaryData, TaskProviderCost } from './types';

function invalid(): never { throw new Error('TASK_COST_UNAVAILABLE'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)) invalid();
  return value;
}
function money(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,11})\.[0-9]{6}$/u.test(value)) invalid();
  return value;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function bool(value: unknown): boolean { if (typeof value !== 'boolean') invalid(); return value; }
export function normalizeTaskCostSummary(value: unknown): TaskCostSummaryData {
  const raw = object(value);
  if (typeof raw.taskStatus !== 'string' || !['排队','处理中','待人工核对','完成','失败'].includes(raw.taskStatus)
    || !Array.isArray(raw.providers) || raw.providers.length !== 2) invalid();
  const providers: TaskProviderCost[] = raw.providers.map(value => {
    const row = object(value);
    if ((row.provider !== '豆包' && row.provider !== '西柚')
      || !['USD','CNY','credits'].includes(String(row.currencyOrUnit))) invalid();
    if ((row.provider === '西柚') !== (row.currencyOrUnit === 'credits')) invalid();
    return { provider: row.provider, currencyOrUnit: row.currencyOrUnit as TaskProviderCost['currencyOrUnit'],
      estimatedCost: row.estimatedCost === null ? null : money(row.estimatedCost), lockedCap: money(row.lockedCap),
      confirmedActual: money(row.confirmedActual), unresolvedReserved: money(row.unresolvedReserved),
      pendingCount: count(row.pendingCount), uncertainCount: count(row.uncertainCount), overCap: bool(row.overCap) };
  });
  if (new Set(providers.map(p => p.provider)).size !== 2) invalid();
  const publicationReady = bool(raw.publicationReady);
  if (publicationReady && providers.some(p => p.pendingCount > 0 || p.uncertainCount > 0 || p.overCap || p.unresolvedReserved !== '0.000000')) invalid();
  return { taskId: id(raw.taskId), taskStatus: raw.taskStatus, reportId: raw.reportId === null ? null : id(raw.reportId), publicationReady, providers };
}
