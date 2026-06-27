import { useState } from 'react';
import styles from './SettingsPage.module.css';

// 三個編輯器共用的動作列:只在 dirty 時出現「還原 / 儲存」。
// saving 與錯誤狀態各編輯器獨立,所以放在這裡而非容器。
export default function SaveBar({ dirty, onSave, onDiscard }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!dirty) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try { await onSave(); }
    catch (e) { setError(e?.message || '儲存失敗，請稍後再試'); }
    finally { setSaving(false); }
  };

  return (
    <div className={styles.saveBar}>
      {error && <span className={styles.saveErr}>{error}</span>}
      <button className={styles.discardBtn} onClick={onDiscard} disabled={saving} title="還原成已儲存的設定">
        還原
      </button>
      <button className={styles.saveBtn} onClick={handleSave} disabled={saving} title="儲存變更到雲端">
        <i className="ti ti-device-floppy"></i>{saving ? '儲存中…' : '儲存'}
      </button>
    </div>
  );
}
