import { useState } from 'react';
import DateInput from '../../../components/DateInput.jsx';
import styles from './SettingsPage.module.css';

// 通用「日期範圍清單」編輯器:值是 [{id,name,start,end}] 陣列。
// 由原 BlackoutEditor 抽出重用——工作區全域 blackout 已移除,現用於每位成員的休假日。
// newRange 是「新增表單」的本地暫存,還沒按新增前不進 ranges;儲存節奏由外層決定(不含 SaveBar)。
export default function DateRangeListEditor({ ranges, onChange, canEdit, addNamePlaceholder = '例如：特休' }) {
  const [newRange, setNewRange] = useState({ name: '', start: '', end: '' });

  const addRange = () => {
    if (!newRange.name || !newRange.start || !newRange.end) return;
    onChange([...ranges, { ...newRange, id: `r${Date.now()}` }]);
    setNewRange({ name: '', start: '', end: '' });
  };

  return (
    <>
      {ranges.map((range) => (
        <div key={range.id} className="blackout-row">
          <span className={styles.blackoutDot}></span>
          <span className="name">{range.name}</span>
          <span className="dates">{range.start} → {range.end}</span>
          {canEdit && (
            <button className="iconbtn-x" onClick={() => onChange(ranges.filter((x) => x.id !== range.id))}>
              <i className="ti ti-x"></i>
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        <div className={styles.addForm}>
          <div className={styles.fieldGrow}>
            <div className={styles.fieldLabel}>名稱</div>
            <input className="text-in" placeholder={addNamePlaceholder}
                   value={newRange.name} onChange={(e) => setNewRange((v) => ({ ...v, name: e.target.value }))} />
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>開始</div>
            <DateInput className="text-in"
                   value={newRange.start} onChange={(e) => setNewRange((v) => ({ ...v, start: e.target.value }))} />
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>結束</div>
            <DateInput className="text-in"
                   value={newRange.end} onChange={(e) => setNewRange((v) => ({ ...v, end: e.target.value }))} />
          </div>
          <button className={`cta-primary ${styles.addBtn}`} onClick={addRange}>
            <i className="ti ti-plus"></i>新增
          </button>
        </div>
      )}
    </>
  );
}
