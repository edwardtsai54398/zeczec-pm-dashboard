import SaveBar from './SaveBar.jsx';
import styles from './SettingsPage.module.css';

// 貓咪陪伴編輯器:草稿是 { catEnabled, catCount }。
// 改用「按下儲存才寫雲端」,所以開關與數量都只改草稿,不再即時落地。
export default function CatCompanionEditor({ draft, onChange, dirty, onSave, onDiscard }) {
  return (
    <div className="card">
      <div className="card-title"><span>貓咪陪伴</span></div>
      <p className="card-sub">在甘特圖的空白處隨機放置貓咪</p>
      <label className={styles.catToggle}>
        <input
          type="checkbox"
          checked={draft.catEnabled}
          onChange={(e) => onChange({ ...draft, catEnabled: e.target.checked })}
        />
        <span>在甘特圖顯示貓咪</span>
      </label>
      <div className={styles.inputRow}>
        <input
          type="number" className={`text-in ${styles.numberInput}`}
          value={draft.catCount} min={0} max={200}
          disabled={!draft.catEnabled}
          onChange={(e) => onChange({ ...draft, catCount: +e.target.value })}
        />
        <span className={styles.unit}>隻貓咪</span>
      </div>
      <SaveBar dirty={dirty} onSave={onSave} onDiscard={onDiscard} />
    </div>
  );
}
