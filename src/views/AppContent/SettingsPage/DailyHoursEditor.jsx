import SaveBar from './SaveBar.jsx';
import styles from './SettingsPage.module.css';

// 每日工時編輯器:草稿就是一個數字(hoursPerDay)。
// 「工作區設定」的一段,外層 .card 由 SettingsPage 提供。canEdit 為 false 時唯讀(可看不可改)。
export default function DailyHoursEditor({ draft, onChange, dirty, onSave, onDiscard, canEdit }) {
  return (
    <div className={styles.section}>
      <div className="card-title"><span>每日工時</span></div>
      <p className="card-sub">用於計算每個工作日可分配的工時上限（不包含週末與不可用時段）</p>
      <div className={styles.inputRow}>
        <input
          type="number" className={`text-in ${styles.numberInput}`}
          value={draft} min={1} max={12}
          disabled={!canEdit}
          onChange={(e) => onChange(+e.target.value)}
        />
        <span className={styles.unit}>小時 / 工作天</span>
      </div>
      {canEdit && <SaveBar dirty={dirty} onSave={onSave} onDiscard={onDiscard} />}
    </div>
  );
}
