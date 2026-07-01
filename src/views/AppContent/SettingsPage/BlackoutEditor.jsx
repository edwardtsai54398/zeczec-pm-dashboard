import { useState } from 'react';
import DateInput from '../../../components/DateInput.jsx';
import SaveBar from './SaveBar.jsx';
import styles from './SettingsPage.module.css';

// 不可用時段編輯器:草稿是 blackouts 陣列。
// newBlackout 是「新增表單」的本地暫存,還沒按新增前不算進草稿,所以不影響 dirty。
// 「工作區設定」的一段,外層 .card 由 SettingsPage 提供。canEdit 為 false 時:清單照常顯示(可看),
// 但隱藏刪除鈕、新增表單與儲存列(不可改)。
export default function BlackoutEditor({ draft, onChange, dirty, onSave, onDiscard, canEdit }) {
  const [newBlackout, setNewBlackout] = useState({ name: '', start: '', end: '' });

  const addBlackout = () => {
    if (!newBlackout.name || !newBlackout.start || !newBlackout.end) return;
    onChange([...draft, { ...newBlackout, id: `b${Date.now()}` }]);
    setNewBlackout({ name: '', start: '', end: '' });
  };

  return (
    <div className={styles.section}>
      <div className="card-title"><span>不可用時段</span></div>
      <p className="card-sub">出國、長假等，排程會自動避開</p>

      {draft.map((b) => (
        <div key={b.id} className="blackout-row">
          <span className={styles.blackoutDot}></span>
          <span className="name">{b.name}</span>
          <span className="dates">{b.start} → {b.end}</span>
          {canEdit && (
            <button className="iconbtn-x" onClick={() => onChange(draft.filter((x) => x.id !== b.id))}>
              <i className="ti ti-x"></i>
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        <div className={styles.addForm}>
          <div className={styles.fieldGrow}>
            <div className={styles.fieldLabel}>名稱</div>
            <input className="text-in" placeholder="例如：員工旅遊"
                   value={newBlackout.name} onChange={(e) => setNewBlackout((v) => ({ ...v, name: e.target.value }))} />
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>開始</div>
            <DateInput className="text-in"
                   value={newBlackout.start} onChange={(e) => setNewBlackout((v) => ({ ...v, start: e.target.value }))} />
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>結束</div>
            <DateInput className="text-in"
                   value={newBlackout.end} onChange={(e) => setNewBlackout((v) => ({ ...v, end: e.target.value }))} />
          </div>
          <button className={`cta-primary ${styles.addBtn}`} onClick={addBlackout}>
            <i className="ti ti-plus"></i>新增
          </button>
        </div>
      )}

      {canEdit && <SaveBar dirty={dirty} onSave={onSave} onDiscard={onDiscard} />}
    </div>
  );
}
