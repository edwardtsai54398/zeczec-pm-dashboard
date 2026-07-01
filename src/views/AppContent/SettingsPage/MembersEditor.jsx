import { useState } from 'react';
import ConfirmModal from '../../../components/ConfirmModal.jsx';
import { ROLE_LABELS } from '../../../lib/permissions.js';
import styles from './SettingsPage.module.css';

// 工作區成員清單:「工作區設定」卡片的一段。純呈現用葉子元件,資料/handler 由 SettingsPage 傳入。
// canManage(owner)時每列給「改角色 / 踢除」控制項;非 owner 唯讀。自己那列一律唯讀,
// 不能自我降級 / 自我踢除(後端 RPC 也會擋,這裡先讓 UI 不出現控制項)。
export default function MembersEditor({
  members, loading, error, canManage, currentUserId, onRoleChange, onRemove,
}) {
  // 待移除的成員(驅動 ConfirmModal);踢除 / 改角色的失敗訊息 inline 顯示。
  const [pendingRemove, setPendingRemove] = useState(null);
  const [actionError, setActionError] = useState('');

  const changeRole = async (userId, role) => {
    setActionError('');
    try { await onRoleChange(userId, role); }
    catch (e) { setActionError(e?.message || '變更角色失敗,請稍後再試'); }
  };

  const confirmRemove = async () => {
    const target = pendingRemove;
    setPendingRemove(null);
    setActionError('');
    try { await onRemove(target.user_id); }
    catch (e) { setActionError(e?.message || '移除成員失敗,請稍後再試'); }
  };

  return (
    <div className={styles.section}>
      <div className="card-title"><span>成員</span></div>
      <p className="card-sub">這個工作區的成員與角色{canManage ? '。你可以調整角色或移除成員。' : '。'}</p>

      {/* 載入中 / 載入失敗 / 空清單 各給一行提示 */}
      {loading && <p className={styles.memberHint}>載入中…</p>}
      {error && <p className={styles.saveErr}>{error}</p>}
      {!loading && !error && members.length === 0 && (
        <p className={styles.memberHint}>目前沒有成員</p>
      )}

      {members.length > 0 && (
        <ul className={styles.memberList}>
          {members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const editable = canManage && !isSelf;
            return (
              <li key={member.user_id} className={styles.memberRow}>
                <span className={styles.memberAvatar} aria-hidden="true">
                  {(member.display_name || member.email || '?').trim().charAt(0).toUpperCase()}
                </span>
                <span className={styles.memberInfo}>
                  <span className={styles.memberName}>
                    {member.display_name || '(未命名)'}
                    {isSelf && <span className={styles.youBadge}>你</span>}
                  </span>
                  <span className={styles.memberEmail}>{member.email}</span>
                </span>

                {canManage ? (
                  // owner 每列都用下拉;自己那列停用(不能自我降級),但保留 select 外觀讓角色欄對齊
                  <select
                    className={`text-in ${styles.roleSelect}`}
                    value={member.role}
                    disabled={isSelf}
                    onChange={(e) => changeRole(member.user_id, e.target.value)}
                  >
                    <option value="owner">{ROLE_LABELS.owner}</option>
                    <option value="editor">{ROLE_LABELS.editor}</option>
                    <option value="viewer">{ROLE_LABELS.viewer}</option>
                  </select>
                ) : (
                  <span className={styles.roleLabel}>{ROLE_LABELS[member.role] ?? member.role}</span>
                )}

                {editable ? (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    title="移除成員"
                    aria-label={`移除 ${member.display_name || member.email}`}
                    onClick={() => setPendingRemove(member)}
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                ) : (
                  // 沒有踢除鈕的列補一個同寬佔位,讓角色欄跨列右緣對齊,不會被推到最右
                  <span className={styles.removeSpacer} aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {actionError && <p className={styles.saveErr}>{actionError}</p>}

      <ConfirmModal
        open={pendingRemove !== null}
        title="移除成員"
        message={`確定要把「${pendingRemove?.display_name || pendingRemove?.email}」移出這個工作區嗎?`}
        confirmLabel="移除"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
