import { render, screen } from '@testing-library/react';
import { describe,it,expect,vi } from 'vitest';
import { normalizeWorkbenchPayload } from '../src/workbench/contract';
import { ActionDrawer } from '../src/workbench/ActionDrawer';
import type { WorkbenchOperations } from '../src/workbench/types';
import { workbenchPayload,OWNER_ID } from './workbench-fixtures';

function fixture(){
  const raw=workbenchPayload();raw.contract_version='report-workbench-v5';
  raw.actions[0].executed_at='2026-09-18T00:00:00Z';raw.actions[0].action_status='观察中';
  raw.actions[0].rank_checks=['no_data','unranked','ranked'].map((availability,index)=>({
    source_id:`90000000-0000-4000-8000-00000000000${index}`,request_status:'成功',checked_at:null,
    observation_date:'2026-09-19',natural_rank:availability==='ranked'?14:null,
    environment_label:'XYDC / US / 历史日级趋势',post_execution:false,billing_state:'结果已保存，账单待核对',
    standard_version:'xydc-daily-rank-v1',completed_evidence:false,availability,day_semantics_state:'provider_day_semantics_unverified'
  }));return raw;
}
describe('daily workbench contract',()=>{
  it('shows unresolved or manually settled daily fees even without a rank observation',()=>{
    const raw=fixture();raw.actions[0].rank_checks=[{...(raw.actions[0].rank_checks as Array<Record<string,unknown>>)[0],
      availability:'unverified',request_status:'失败',billing_state:'费用已核对 0.000000 Credits（无排名结果）'}];
    const data=normalizeWorkbenchPayload(raw);expect(data.contractComplete).toBe(true);
    render(<ActionDrawer data={data} action={data.actions[0]} viewerUserId={OWNER_ID} operations={{} as WorkbenchOperations} onClose={vi.fn()}/>);
    expect(screen.getByText(/尚无可验证排名.*费用已核对 0.000000 Credits/)).toBeVisible();
    expect(screen.queryByText(/自然位未上榜/)).toBeNull();
  });
  it('retains stable date-only history and distinguishes missing data from unranked observations',()=>{
    const data=normalizeWorkbenchPayload(fixture());expect(data.contractComplete).toBe(true);
    render(<ActionDrawer data={data} action={data.actions[0]} viewerUserId={OWNER_ID} operations={{} as WorkbenchOperations} onClose={vi.fn()}/>);
    expect(screen.getByText(/ABA 前 200 万/)).toBeVisible();
    expect(screen.getByText(/该日未返回排名数据，覆盖情况待确认/)).toBeVisible();
    expect(screen.getByText(/当日未返回自然位名次/)).toBeVisible();
    expect(screen.getByText(/自然位第 14 名/)).toBeVisible();
    expect(screen.getByText(/日级口径待供应商确认/)).toBeVisible();
    expect(screen.queryByText(/日级.*00:00/)).toBeNull();
    expect(screen.queryByText(/自然位第 0 名|自然位未上榜/)).toBeNull();
    expect(screen.queryByText('自然位两次跌出前 10，停止继续降投并复核。')).toBeNull();
  });
  it('rejects invented timestamps, completed eligibility and unsupported coverage assertions',()=>{
    for(const extra of [{checked_at:'2026-09-19T00:00:00Z'},{completed_evidence:true},{post_execution:true},{availability:'unsupported'},{day_semantics_state:'verified'}]){
      const raw=fixture();Object.assign((raw.actions[0].rank_checks as Array<Record<string,unknown>>)[0],extra);expect(normalizeWorkbenchPayload(raw).contractComplete).toBe(false);
    }
  });
});
