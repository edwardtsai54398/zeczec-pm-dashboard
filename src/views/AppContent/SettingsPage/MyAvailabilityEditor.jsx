import { useState } from 'react';
import DateRangeListEditor from './DateRangeListEditor.jsx';
import SaveBar from './SaveBar.jsx';
import styles from './SettingsPage.module.css';

// 「每日工時／休假」:編輯自己在這個工作區的每日工時 + 休假日,存進自己那筆成員 settings。
// 屬個人資料,不受角色限制(檢視者也能改自己);誰都不能改別人的(後端只寫 auth.uid() 那列)。
// 本地草稿,按「儲存」才呼叫 onSave(dailyHours, daysOff) 落地;dirty 才顯示 SaveBar。
// 「個人化設定」的一段,外層 .card 由 SettingsPage 提供;由外層在成員載入後才掛載並以 workspaceId 當 key。
export default function MyAvailabilityEditor({ myMember, defaultHours, onSave }) {
  const settings = myMember?.settings || {};
  const savedHours = settings.daily_hours != null ? String(settings.daily_hours) : '';
  const savedDaysOff = settings.days_off || [];
  const [hoursValue, setHoursValue] = useState(savedHours);
  const [daysOff, setDaysOff] = useState(savedDaysOff);

  const dirty =
    hoursValue !== savedHours ||
    JSON.stringify(daysOff) !== JSON.stringify(savedDaysOff);

  // 空字串 = 清掉覆寫、回到工作區預設(傳 null)。
  const save = () => onSave(hoursValue === '' ? null : Number(hoursValue), daysOff);
  const discard = () => { setHoursValue(savedHours); setDaysOff(savedDaysOff); };

  return (
    <div className={styles.section}>
      <div className="card-title"><span>每日工時／休假</span></div>
      <p className="card-sub">設定你在這個工作區的每日工時與休假日,排程會依此估算你的工作負載</p>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>每日工時</div>
        <input type="number" min="0" step="0.5" className="text-in"
               placeholder={`預設 ${defaultHours}h`}
               value={hoursValue} onChange={(e) => setHoursValue(e.target.value)} />
      </div>
      <div className={styles.availDaysOff}>
        <div className={styles.fieldLabel}>休假日</div>
        <DateRangeListEditor ranges={daysOff} onChange={setDaysOff} canEdit addNamePlaceholder="例如：特休" />
      </div>
      <SaveBar dirty={dirty} onSave={save} onDiscard={discard} />
    </div>
  );
}
