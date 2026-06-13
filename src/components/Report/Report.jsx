import { useState } from 'react';
import { ReportModal } from './ReportModal.jsx';
import ReportCat from './ReportCat.jsx';
import styles from './Report.module.css';

// 右下角「回報問題」貓咪對話框按鈕 + 回報彈窗。view 為當前頁面，帶進 Sentry tag。
export function Report({ view }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.fab} aria-label="回報問題" onClick={() => setOpen(true)}>
        <ReportCat className={styles.fabArt} />
      </button>
      <ReportModal open={open} onClose={() => setOpen(false)} view={view} />
    </>
  );
}
