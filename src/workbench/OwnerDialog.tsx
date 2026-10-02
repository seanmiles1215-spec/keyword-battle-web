import { FormEvent, useState } from "react";

import type { WorkspaceMember } from "./types";

export function OwnerDialog({
  members,
  initialOwnerUserId,
  initialDate,
  onCancel,
  onAssign,
}: {
  members: WorkspaceMember[];
  initialOwnerUserId: string | null;
  initialDate: string | null;
  onCancel: () => void;
  onAssign: (ownerUserId: string, plannedExecutionDate: string) => void;
}) {
  const [ownerUserId, setOwnerUserId] = useState(initialOwnerUserId ?? "");
  const [plannedDate, setPlannedDate] = useState(initialDate ?? "");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (ownerUserId && plannedDate) onAssign(ownerUserId, plannedDate);
  }
  return <div className="modal-backdrop"><form className="modal-card" role="dialog" aria-modal="true" aria-label="分配工作区 Owner" onSubmit={submit}>
    <h2>分配 Owner</h2>
    <label>工作区成员<select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}>
      <option value="">请选择启用成员</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
    </select></label>
    <label>计划执行日<input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></label>
    <p className="form-help">权限只绑定工作区成员账号；外部 Owner 姓名仅展示，不授予访问权。</p>
    <div className="button-row"><button type="button" onClick={onCancel}>取消</button><button className="primary" type="submit" disabled={!ownerUserId || !plannedDate}>确认分配</button></div>
  </form></div>;
}
