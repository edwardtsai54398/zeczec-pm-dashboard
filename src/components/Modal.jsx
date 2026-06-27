import { useEffect } from 'react';

// 共用彈窗基底：遮罩 + 盒子 + 點外面/Esc 關閉 + 開啟時 focus。
// 沿用全域 .modal-overlay / .modal-box 樣式（index.css），內容由 children 決定。
export default function Modal({ open, onClose, initialFocusRef, children }) {
  useEffect(() => {
    if (open) initialFocusRef?.current?.focus();
  }, [open, initialFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
