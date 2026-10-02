import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TaskCostSummary } from '../src/workbench/TaskCostSummary';
import { normalizeTaskCostSummary } from '../src/workbench/task-cost-contract';
import { WorkbenchPage } from '../src/workbench/WorkbenchPage';
import type { WorkbenchPageServices } from '../src/workbench/services';
import { workbenchPayload, TASK_ID, REPORT_ID, CREATOR_ID } from './workbench-fixtures';

export const costSummaryFixture = (taskId = '60000000-0000-4000-8000-000000000001') => ({
  taskId, taskStatus: '待人工核对', reportId: null, publicationReady: false,
  providers: [
    { provider: '豆包', currencyOrUnit: 'USD', estimatedCost: '0.020000', lockedCap: '0.020000', confirmedActual: '0.000000', unresolvedReserved: '0.010000', pendingCount: 1, uncertainCount: 0, overCap: false },
    { provider: '西柚', currencyOrUnit: 'credits', estimatedCost: null, lockedCap: '72.000000', confirmedActual: '0.000000', unresolvedReserved: '0.000000', pendingCount: 0, uncertainCount: 0, overCap: false },
  ],
});
it('shows separated actual and unresolved amounts without claiming free or enabling bill entry', () => {
  render(<TaskCostSummary summary={normalizeTaskCostSummary(costSummaryFixture())} />);
  expect(screen.getAllByText('已核实实扣')).toHaveLength(2);
  expect(screen.getByText('账单待核对，当前实扣不是最终总额')).toBeVisible();
  expect(screen.getByText('USD 0.010000')).toBeVisible();
  expect(screen.getByText('未提供')).toBeVisible();
  expect(screen.queryByText('免费')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '确认账单' })).not.toBeInTheDocument();
});
it('rejects incomplete or unknown contracts instead of manufacturing zero', () => {
  for (const value of [{}, { ...costSummaryFixture(), taskStatus: 'future-state' },
    { ...costSummaryFixture(), providers: [] }, { ...costSummaryFixture(), publicationReady: true }]) {
    expect(() => normalizeTaskCostSummary(value)).toThrow();
  }
});
it('does not serialize injected internal metadata and preserves real units and zero', () => {
  const raw = costSummaryFixture(); raw.providers[0].currencyOrUnit = 'CNY'; raw.providers[0].pendingCount = 0;
  raw.providers[0].unresolvedReserved = '0.000000'; raw.publicationReady = true;
  const safe = normalizeTaskCostSummary({ ...raw, receipt: 'private', providers: raw.providers.map(p => ({ ...p, account: 'private' })) });
  expect(JSON.stringify(safe)).not.toContain('private');
  render(<TaskCostSummary summary={safe} />);
  expect(screen.getAllByText('CNY 0.000000').length).toBeGreaterThan(0);
  expect(screen.queryByText(/不是最终总额/)).not.toBeInTheDocument();
});
it('shows overcap as blocked rather than a refundable or negative charge', () => {
  const raw = costSummaryFixture(); raw.providers[0].overCap = true; raw.providers[0].confirmedActual = '0.030000';
  render(<TaskCostSummary summary={normalizeTaskCostSummary(raw)} />);
  expect(screen.getByText('费用超额，已停止后续调用与发布')).toBeVisible();
  expect(screen.getByText('USD 0.030000')).toBeVisible();
});
function pageServices(read: (id: string) => Promise<unknown>) {
  return { getTaskCostSummary: vi.fn(read), resolveActiveReportId: vi.fn().mockRejectedValue(new Error('ACTIVE_REPORT_NOT_READY')),
    getReportWorkbench: vi.fn() } as unknown as WorkbenchPageServices;
}
it('loads task cost while unpublished without actions or snapshot downloads', async () => {
  const raw = costSummaryFixture(); const services = pageServices(async () => raw);
  render(<WorkbenchPage taskId={raw.taskId} viewerUserId='viewer' services={services} />);
  expect(await screen.findByRole('region', { name: '任务费用' })).toBeVisible();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(services.getReportWorkbench).not.toHaveBeenCalled();
});
it('clears prior summary immediately when navigating to an unauthorized task', async () => {
  const raw = costSummaryFixture(); const services = pageServices(async id => { if (id !== raw.taskId) throw new Error('denied'); return raw; });
  const { rerender } = render(<WorkbenchPage taskId={raw.taskId} viewerUserId='viewer' services={services} />);
  await screen.findByRole('region', { name: '任务费用' });
  rerender(<WorkbenchPage taskId='60000000-0000-4000-8000-000000000002' viewerUserId='viewer' services={services} />);
  expect(screen.queryByRole('region', { name: '任务费用' })).not.toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent(/无法|失败|无权/);
});
it('ignores delayed results from previous identity or task after navigation', async () => {
  let resolve!: (value: unknown) => void; const raw = costSummaryFixture();
  let calls = 0; const services = pageServices(async () => ++calls === 1 ? new Promise(done => { resolve = done; }) : Promise.reject(new Error('denied')));
  const { rerender } = render(<WorkbenchPage taskId={raw.taskId} viewerUserId='first-viewer' services={services} />);
  rerender(<WorkbenchPage taskId={raw.taskId} viewerUserId='second-viewer' services={services} />);
  await screen.findByRole('alert');
  await act(async () => { resolve(raw); });
  expect(screen.queryByRole('region', { name: '任务费用' })).not.toBeInTheDocument();
});
it('clears loaded report and summary together on another task', async () => {
  const raw = costSummaryFixture(TASK_ID); const published = { ...raw, reportId: REPORT_ID };
  const services = pageServices(async id => { if (id !== TASK_ID) throw new Error('denied'); return published; });
  services.resolveActiveReportId = vi.fn().mockResolvedValue(REPORT_ID);
  services.getReportWorkbench = vi.fn().mockResolvedValue(workbenchPayload());
  const { rerender } = render(<WorkbenchPage taskId={TASK_ID} viewerUserId={CREATOR_ID} services={services} />);
  await screen.findByRole('heading', { name: '关键词经营工作台' });
  rerender(<WorkbenchPage taskId='60000000-0000-4000-8000-000000000099' viewerUserId={CREATOR_ID} services={services} />);
  expect(screen.queryByRole('heading', { name: '关键词经营工作台' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '任务费用' })).not.toBeInTheDocument();
  await screen.findByRole('alert');
});
it('cannot restore an old report when its request resolves after route change', async () => {
  let resolve!: (value: unknown) => void;
  const services = pageServices(async id => { if (id !== TASK_ID) throw new Error('denied'); return { ...costSummaryFixture(TASK_ID), reportId: REPORT_ID }; });
  services.resolveActiveReportId = vi.fn().mockResolvedValue(REPORT_ID);
  services.getReportWorkbench = vi.fn(() => new Promise(done => { resolve = done; }));
  const { rerender } = render(<WorkbenchPage taskId={TASK_ID} viewerUserId={CREATOR_ID} services={services} />);
  await screen.findByRole('region', { name: '任务费用' });
  await act(async () => {});
  expect(services.getReportWorkbench).toHaveBeenCalledOnce();
  rerender(<WorkbenchPage taskId='60000000-0000-4000-8000-000000000099' viewerUserId={CREATOR_ID} services={services} />);
  await screen.findByRole('alert');
  await act(async () => { resolve(workbenchPayload()); });
  expect(screen.queryByRole('heading', { name: '关键词经营工作台' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '任务费用' })).not.toBeInTheDocument();
});
