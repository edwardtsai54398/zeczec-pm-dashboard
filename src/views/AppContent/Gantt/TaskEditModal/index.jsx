import { useState } from 'react';
import { fmt, pD } from '../../../../lib/dateUtils.js';
import { BT } from '../../../../lib/tasks.js';
import DateInput from '../../../../components/DateInput.jsx';
import styles from './TaskEditModal.module.css';

// 雙擊甘特條後彈出:可改寫該任務的工時、等待天數,或釘選開始日。
export default function TaskEditModal({ state, projects, data, onSave, onClose }) {
  const project = projects.find((p) => p.id === state.pid);
  const projectTask = (project?.tasks || []).find((task) => task.id === state.taskId);
  const scheduled = data[state.pid]?.[state.taskId];
  const baseTask = BT.find((base) => base.id === state.taskId);
  const isPmTemplate = project?.template === 'pm';
  const defaultHours = isPmTemplate ? (baseTask?.pm ?? 0) : (baseTask?.h ?? 0);
  const defaultWait = baseTask?.w ?? 0;

  const [hoursValue, setHoursValue] = useState(
    projectTask?.pinnedHours != null ? String(projectTask.pinnedHours) : ''
  );
  const [waitValue, setWaitValue] = useState(
    projectTask?.pinnedWait != null ? String(projectTask.pinnedWait) : ''
  );
  const [pinEnabled, setPinEnabled] = useState(!!projectTask?.pinnedStart);
  const [pinDateValue, setPinDateValue] = useState(projectTask?.pinnedStart || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const effectiveStart = scheduled?.start ? new Date(scheduled.start) : null;
  const parsedPinDate = pinEnabled && pinDateValue ? pD(pinDateValue) : null;
  // 若 effectiveStart 等於先前已存的釘選日,代表這個日期是釘選自己造成的
  // (而非依賴項目卡住),把釘選日往前移就不該觸發警告。
  const parsedOldPinDate = projectTask?.pinnedStart ? pD(projectTask.pinnedStart) : null;
  const pinWasCausingEffectiveStart =
    parsedOldPinDate && effectiveStart && +effectiveStart === +parsedOldPinDate;
  const isPinOverridden =
    parsedPinDate && effectiveStart && effectiveStart > parsedPinDate && !pinWasCausingEffectiveStart;

  // 寫雲端完成前不關彈窗;失敗則留住彈窗顯示錯誤。
  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(state.pid, state.taskId, {
        pinnedStart: pinEnabled && pinDateValue ? pinDateValue : null,
        pinnedHours: hoursValue !== '' ? Number(hoursValue) : null,
        pinnedWait:  waitValue  !== '' ? Number(waitValue)  : null,
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
          <div className={styles.title}>{scheduled?.n}</div>
          <div className={styles.sub}>{fmt(scheduled?.start)} – {fmt(scheduled?.end)}</div>
        </div>

        <div className={styles.info}>
          <span><span className={styles.infoLabel}>預設工時</span>{defaultHours}h</span>
          <span><span className={styles.infoLabel}>預設等待天數</span>{defaultWait} 天</span>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>新的工時（小時）</label>
            <input
              type="number" min="0" step="0.5"
              className={styles.input}
              placeholder={`預設 ${defaultHours}h`}
              value={hoursValue}
              onChange={(e) => setHoursValue(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>新的等待天數（工作天）</label>
            <input
              type="number" min="0" step="1"
              className={styles.input}
              placeholder={`預設 ${defaultWait} 天`}
              value={waitValue}
              onChange={(e) => setWaitValue(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.pinRow}>
              <input type="checkbox" checked={pinEnabled} onChange={(e) => setPinEnabled(e.target.checked)} />
              <span className={styles.label}>固定開始日期</span>
              {pinEnabled && (
                <DateInput className={styles.pinDate}
                  value={pinDateValue} onChange={(e) => setPinDateValue(e.target.value)} />
              )}
            </label>
            {isPinOverridden && (
              <div className={styles.pinWarn}>
                <i className="ti ti-alert-triangle"></i>
                依賴項目較晚結束，釘選日已被自動延後
              </div>
            )}
          </div>
        </div>

        {saveError && <div className={styles.pinWarn}>{saveError}</div>}

        <div className={styles.footer}>
          <button className={styles.pinBtn} onClick={onClose} disabled={saving}>取消</button>
          <button className={`${styles.pinBtn} ${styles.primary}`} onClick={handleSave} disabled={saving}>
            {saving ? '儲存中…' : '儲存並重算'}
          </button>
        </div>
      </div>
    </div>
  );
}
