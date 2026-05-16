import { useEffect, useRef } from 'react';

export function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title || '確認操作'}</div>
        <p className="modal-msg">{message || '此操作無法復原，確定要繼續嗎？'}</p>
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>取消</button>
          <button className="modal-btn confirm" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel || '確定刪除'}
          </button>
        </div>
      </div>
    </div>
  );
}
