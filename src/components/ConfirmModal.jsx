import { useRef } from 'react';
import { Modal } from './Modal.jsx';

export function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  return (
    <Modal open={open} onClose={onCancel} initialFocusRef={confirmRef}>
      <div className="modal-title">{title || '確認操作'}</div>
      <p className="modal-msg">{message || '此操作無法復原，確定要繼續嗎？'}</p>
      <div className="modal-actions">
        <button className="modal-btn cancel" onClick={onCancel}>取消</button>
        <button className="modal-btn confirm" ref={confirmRef} onClick={onConfirm}>
          {confirmLabel || '確定刪除'}
        </button>
      </div>
    </Modal>
  );
}
