import { useState, useMemo } from 'react';
import { fmtF } from '../../../../lib/dateUtils.js';
import { deriveEnd, workingHoursBetween } from '../../../../lib/scheduleTime.js';
import { useWorkspace } from '../../../../context/WorkspaceContext.jsx';
import { useAuthContext } from '../../../../context/AuthContext.jsx';
import { useWorkspaceMembers } from '../../../../hooks/useWorkspaceMembers.js';
import DateInput from '../../../../components/DateInput.jsx';
import TimeSelect from '../../../../components/TimeSelect/index.jsx';
import styles from './AddTaskModal.module.css';

// 甘特圖「新增任務」彈窗:替某個專案手動新增一個自訂任務(不在 BT 模板裡)。
// 欄位比照雙擊的 TaskEditModal(開始/結束時間、0 工時、負責人、等待天數),最上面多了任務名稱與專案選擇。
// 「工時」不直接輸入,由「開始 + 結束」推導(結束時間本來就不落地);儲存走 context 的 addCustomTask 直接落地。
export default function AddTaskModal({ defaultProjectId, onClose }) {
  const { projects, settings, addCustomTask } = useWorkspace();
  const { workspaceId } = useAuthContext();
  const { members } = useWorkspaceMembers(workspaceId);
  const ownerId = members.find((member) => member.role === 'owner')?.user_id ?? null;

  const [name, setName] = useState('');
  const [pid, setPid] = useState(defaultProjectId || projects[0]?.id || '');
  const [startDay, setStartDay] = useState(fmtF(new Date()));
  const [startMin, setStartMin] = useState(10 * 60);
  const [hours, setHours] = useState(1); // 自訂任務沒有 BT 預設,先給 1 小時
  const [waitValue, setWaitValue] = useState('0');
  const [assignee, setAssignee] = useState(ownerId ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // 某位負責人(未指派 → owner)的每日工時 + 休假,給「開始/結束/工時」互推用。
  const availabilityFor = (who) => {
    const member = members.find((m) => m.user_id === (who || ownerId));
    return {
      dailyHours: member?.settings?.daily_hours ?? (settings?.hoursPerDay || 8),
      daysOff: member?.settings?.days_off ?? [],
    };
  };

  const availability = availabilityFor(assignee);
  // 結束時間 = 開始 + 工時 推導出來(顯示用);使用者改結束時間時反推工時。
  const { endDay, endMin } = useMemo(
    () => deriveEnd(startDay, startMin, hours, availabilityFor(assignee), settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startDay, startMin, hours, assignee, members, settings],
  );
  const isZeroHours = hours <= 0;

  const snapHours = (raw) => Math.max(0, Math.round(raw * 2) / 2);
  const applyEnd = (nextEndDay, nextEndMin) => {
    setHours(snapHours(workingHoursBetween(startDay, startMin, nextEndDay, nextEndMin, availability, settings)));
  };
  const toggleZeroHours = (checked) => {
    setHours(checked ? 0 : 1);
  };

  const canSave = !!name.trim() && !!pid && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError('');
    try {
      await addCustomTask(pid, {
        name: name.trim(),
        startDay: startDay || null,
        startMin,
        hours,
        wait: waitValue !== '' ? Number(waitValue) : 0,
        assignee: assignee || null,
      });
      onClose();
    } catch (error) {
      setSaveError(error?.message || '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop}
      onMouseDown={(e) => { if (!saving && e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>新增任務</div>
          <div className={styles.sub}>手動加一個自訂任務到選定專案</div>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>任務名稱</label>
            <input type="text" className={styles.input} value={name}
              placeholder="例如：額外拍攝、專屬活動"
              onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>專案</label>
            <select className={styles.select} value={pid}
              onChange={(e) => setPid(e.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>開始時間</label>
            <div className={styles.dtRow}>
              <DateInput className={styles.dtDate} value={startDay}
                onChange={(e) => setStartDay(e.target.value)} />
              <TimeSelect value={startMin} minMin={8 * 60} maxMin={23 * 60 + 30}
                onChange={setStartMin} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>結束時間</label>
            <div className={styles.dtRow}>
              <DateInput className={styles.dtDate} value={endDay}
                onChange={(e) => applyEnd(e.target.value, endMin)} />
              <TimeSelect value={endMin} minMin={8 * 60} maxMin={24 * 60}
                onChange={(min) => applyEnd(endDay, min)} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={isZeroHours}
                onChange={(e) => toggleZeroHours(e.target.checked)} />
              <span className={styles.label}>0 工時（發文類，只佔一天不排時段）</span>
            </label>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>負責人</label>
            <select className={styles.select} value={assignee || ownerId || ''}
              onChange={(e) => setAssignee(e.target.value)}>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name || member.email}{member.user_id === ownerId ? '（預設）' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>等待天數（工作天）</label>
            <input type="number" min="0" step="1" className={styles.input}
              value={waitValue} onChange={(e) => setWaitValue(e.target.value)} />
          </div>
        </div>

        {saveError && <div className={styles.error}>{saveError}</div>}

        <div className={styles.footer}>
          <button className={styles.btn} onClick={onClose} disabled={saving}>取消</button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={handleSave} disabled={!canSave}>
            {saving ? '儲存中…' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}
