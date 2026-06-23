import { useRef, useState } from 'react';
import { Modal } from './Modal.jsx';

export function UnsavedChangesModal({ open, onDiscard, onSave, onClose }) {
  const saveRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave();
    } catch (e) {
      setError(e?.message || '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} initialFocusRef={saveRef}>
      <div className="modal-title">尚未儲存的變更</div>
      <p className="modal-msg">你有尚未儲存的變更，要捨棄還是儲存？</p>
      {error && <p className="modal-msg" style={{ color: '#b4453c', margin: '0 0 16px' }}>{error}</p>}
      <div className="modal-actions">
        <button className="modal-btn cancel" onClick={onDiscard} disabled={saving}>捨棄</button>
        <button className="modal-btn confirm" ref={saveRef} onClick={handleSave} disabled={saving}>
          {saving ? '儲存中…' : '儲存設定'}
        </button>
      </div>
    </Modal>
  );
}
