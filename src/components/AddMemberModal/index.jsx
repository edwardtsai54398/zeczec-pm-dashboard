import { useState, useRef } from 'react';
import Modal from '../Modal.jsx';
import { ROLE_LABELS } from '../../lib/permissions.js';
import styles from './AddMemberModal.module.css';

// 新增成員彈窗:輸入夥伴註冊的 email + 選角色,確定後交由 onConfirm 寫雲端。
// loading / error 狀態比照 UnsavedChangesModal,沿用全域 modal class。
export default function AddMemberModal({ open, onClose, onConfirm }) {
  const emailRef = useRef(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (saving) return;
    setError('');
    onClose();
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    try {
      await onConfirm(email.trim(), role);
      // 成功才清空 + 關閉;失敗則保留輸入讓使用者修正。
      setEmail('');
      setRole('viewer');
      onClose();
    } catch (e) {
      setError(e?.message || '新增失敗,請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} initialFocusRef={emailRef}>
      <div className="modal-title">新增成員</div>
      <p className="modal-msg">輸入夥伴註冊的 Email,並指定他在這個工作區的角色。</p>

      <div className={styles.field}>
        <div className={styles.label}>Email</div>
        <input
          ref={emailRef}
          type="email"
          className="text-in"
          placeholder="partner@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.label}>角色</div>
        <select className="text-in" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="owner">{ROLE_LABELS.owner}</option>
          <option value="editor">{ROLE_LABELS.editor}</option>
          <option value="viewer">{ROLE_LABELS.viewer}</option>
        </select>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className="modal-actions">
        <button className="modal-btn cancel" onClick={close} disabled={saving}>取消</button>
        <button
          className="modal-btn confirm"
          onClick={handleConfirm}
          disabled={saving || !email.trim()}
        >
          {saving ? '新增中…' : '確定'}
        </button>
      </div>
    </Modal>
  );
}
