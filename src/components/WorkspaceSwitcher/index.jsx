import { useState, useRef, useEffect } from 'react';
import { useAuthContext } from '../../context/AuthContext.jsx';
import { ROLE_LABELS } from '../../lib/permissions.js';
import styles from './WorkspaceSwitcher.module.css';

// Topbar 的工作區切換器:列出登入者所屬的全部工作區,點選即切換當前工作區。
// 目前工作區左側打勾 + 背景高亮。仿 AvatarMenu 的 popover(點外面 / Esc 關閉)。
export default function WorkspaceSwitcher() {
  const { workspaces, workspaceId, selectWorkspace } = useAuthContext();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

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

  const current = workspaces.find((workspace) => workspace.id === workspaceId);
  if (!current) return null;

  const choose = (id) => {
    selectWorkspace(id);
    setOpen(false);
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        title={current.name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <i className="ti ti-building" aria-hidden="true" />
        <span className={styles.name}>{current.name}</span>
        <i className="ti ti-chevron-down" aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.popover} role="menu">
          {workspaces.map((workspace) => {
            const active = workspace.id === workspaceId;
            return (
              <button
                key={workspace.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`${styles.item} ${active ? styles.itemActive : ''}`}
                onClick={() => choose(workspace.id)}
              >
                <span className={styles.check}>
                  {active && <i className="ti ti-check" aria-hidden="true" />}
                </span>
                <span className={styles.itemName}>{workspace.name}</span>
                <span className={styles.role}>{ROLE_LABELS[workspace.role] ?? ''}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
