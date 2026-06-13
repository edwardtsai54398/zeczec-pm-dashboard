import { useState, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { Modal } from '../Modal.jsx';
import { getSettingsSnapshot } from '../SettingsIO/settingsIO.js';
import styles from './Report.module.css';

// 把使用者回報送進 Sentry：訊息 + 當前頁面 tag + localStorage 設定快照附件。
function handleReport(text, view) {
  const snapshot = getSettingsSnapshot();
  Sentry.withScope((scope) => {
    scope.setTag('page', view);              // 紀錄當下頁面
    scope.setLevel('info');
    scope.addAttachment({                    // 附加 localStorage 快照
      filename: 'settings-snapshot.json',
      data: JSON.stringify(snapshot, null, 2),
      contentType: 'application/json',
    });
    Sentry.captureMessage(`[使用者回報] ${text}`);
  });
}

export function ReportModal({ open, onClose, view }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const textareaRef = useRef(null);

  // 關閉並重置，下次開啟為乾淨表單。
  const close = () => {
    setText('');
    setSent(false);
    onClose();
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    handleReport(trimmed, view);
    setSent(true);
    setTimeout(close, 1500);  // 顯示成功訊息後自動關閉
  };

  return (
    <Modal open={open} onClose={close} initialFocusRef={textareaRef}>
      {sent ? (
        <div className={styles.success}>
          <i className="ti ti-circle-check" aria-hidden="true" />
          <span>感謝回報！我們會盡快查看</span>
        </div>
      ) : (
        <>
          <div className={styles.title}>回報問題</div>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="請描述你遇到的問題…"
          />
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={close}>取消</button>
            <button type="button" className={styles.btnPrimary} onClick={handleSubmit} disabled={!text.trim()}>
              送出
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
