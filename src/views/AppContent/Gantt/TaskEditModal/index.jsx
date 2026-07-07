import { useState, useMemo } from 'react';
import { fmtF } from '../../../../lib/dateUtils.js';
import { BT } from '../../../../lib/tasks.js';
import { deriveEnd, workingHoursBetween, offsetToClockMin } from '../../../../lib/scheduleTime.js';
import { useWorkspace } from '../../../../context/WorkspaceContext.jsx';
import { useAuthContext } from '../../../../context/AuthContext.jsx';
import { useWorkspaceMembers } from '../../../../hooks/useWorkspaceMembers.js';
import DateInput from '../../../../components/DateInput.jsx';
import TimeSelect from '../../../../components/TimeSelect/index.jsx';
import styles from './TaskEditModal.module.css';

// 雙擊甘特條/行事曆區塊後彈出的任務排程設定。由上到下:開始時間、結束時間、0 工時、負責人、等待天數。
// 「工時(時長)」不直接輸入,而是由「開始 + 結束」推導(結束時間本來就不落地);0 工時 = 開始等於結束。
// onSave(pid, taskId, changes):由呼叫端(view)接 apply-then-ask —— 先寫「只改這一個」,再問要不要重排下游。
export default function TaskEditModal({ state, projects, data, onSave, onClose }) {
  const { settings } = useWorkspace();
  const { workspaceId } = useAuthContext();
  const { members } = useWorkspaceMembers(workspaceId);
  const ownerId = members.find((member) => member.role === 'owner')?.user_id ?? null;

  const project = projects.find((p) => p.id === state.pid);
  const projectTask = (project?.tasks || []).find((task) => task.id === state.taskId);
  const scheduled = data[state.pid]?.[state.taskId];
  const baseTask = BT.find((base) => base.id === state.taskId);
  const isPmTemplate = project?.template === 'pm';
  const defaultHours = isPmTemplate ? (baseTask?.pm ?? 0) : (baseTask?.h ?? 0);
  const defaultWait = baseTask?.w ?? 0;

  // 某位負責人(未指派 → owner)的每日工時 + 休假,給「開始/結束/工時」互推用。
  const availabilityFor = (assignee) => {
    const member = members.find((m) => m.user_id === (assignee || ownerId));
    return {
      dailyHours: member?.settings?.daily_hours ?? (settings?.hoursPerDay || 8),
      daysOff: member?.settings?.days_off ?? [],
    };
  };

  // 初值:釘選值優先,否則沿用目前落地排程(第一天的 o 換回開始時鐘)。
  const initialStartDay = projectTask?.pinnedStart
    || (scheduled?.start ? fmtF(new Date(scheduled.start)) : fmtF(new Date()));
  const initialStartMin = projectTask?.pinnedStartMin
    ?? (scheduled?.start
      ? offsetToClockMin(scheduled.days?.[fmtF(new Date(scheduled.start))]?.o ?? 0)
      : 10 * 60);
  const initialHours = projectTask?.pinnedHours ?? (scheduled?.hours ?? defaultHours);

  const [startDay, setStartDay] = useState(initialStartDay);
  const [startMin, setStartMin] = useState(initialStartMin);
  const [hours, setHours] = useState(initialHours);
  const [waitValue, setWaitValue] = useState(
    String(projectTask?.pinnedWait ?? (scheduled?.w ?? defaultWait))
  );
  const [assignee, setAssignee] = useState(projectTask?.assignee ?? ownerId ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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
    setHours(checked ? 0 : (defaultHours > 0 ? defaultHours : 1));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(state.pid, state.taskId, {
        pinnedStart: startDay || null,
        pinnedStartMin: startMin,
        pinnedHours: hours,
        pinnedWait: waitValue !== '' ? Number(waitValue) : null,
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
          <div className={styles.title}>{scheduled?.n || baseTask?.n || '任務'}</div>
          <div className={styles.sub}>{project?.name}</div>
        </div>

        <div className={styles.body}>
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
              placeholder={`預設 ${defaultWait} 天`}
              value={waitValue} onChange={(e) => setWaitValue(e.target.value)} />
          </div>
        </div>

        {saveError && <div className={styles.error}>{saveError}</div>}

        <div className={styles.footer}>
          <button className={styles.btn} onClick={onClose} disabled={saving}>取消</button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={handleSave} disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
