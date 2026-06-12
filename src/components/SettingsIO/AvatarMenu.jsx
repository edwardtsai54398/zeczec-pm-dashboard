// 頭像 + popover（匯出/匯入設定）。這是暫時性功能,未來移除時把 Topbar 的
// <AvatarMenu /> 改回靜態頭像、並刪掉 src/components/SettingsIO/ 即可。
import { useState, useRef, useEffect } from 'react';
import avatarImg from '../../assets/avatar.jpg';
import { exportSettings, importSettings } from './settingsIO.js';
import styles from './AvatarMenu.module.css';

export function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const fileRef = useRef(null);

  // 點外面 / 按 Esc 關閉 popover。
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleExport = () => {
    exportSettings();
    setOpen(false);
  };

  const handleImportClick = () => fileRef.current?.click();

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允許再次選同一個檔案
    if (!file) return;
    setOpen(false);
    importSettings(file).catch((err) => {
      console.error('匯入設定失敗', err);
      alert('匯入失敗:檔案格式不正確');
    });
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`avatar ${styles.trigger}`}
        title="使用者"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <img src={avatarImg} alt="使用者"
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
      </button>

      {open && (
        <div className={styles.popover} role="menu">
          <button type="button" className={styles.item} role="menuitem" onClick={handleExport}>
            <i className="ti ti-download" aria-hidden="true" />
            匯出設定
          </button>
          <button type="button" className={styles.item} role="menuitem" onClick={handleImportClick}>
            <i className="ti ti-upload" aria-hidden="true" />
            匯入設定
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
