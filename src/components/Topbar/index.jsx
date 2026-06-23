import { AvatarMenu } from "../SettingsIO/AvatarMenu.jsx";
import { useAuthContext } from "../../context/AuthContext.jsx";
import styles from "./Topbar.module.css";

export function Topbar({ projectCount, showAvatar }) {
  const { workspaces } = useAuthContext();
  const workspaceName = workspaces[0]?.name;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-name">募資專案管理</span>
        <span className={styles.countBadge}>
          {projectCount} 個專案
        </span>
      </div>
      <div className="topbar-spacer"></div>
      {workspaceName && (
        <div className={styles.workspacePill} title={workspaceName}>
          <i className="ti ti-building" aria-hidden="true" />
          <span className={styles.workspaceName}>{workspaceName}</span>
        </div>
      )}
      {showAvatar && <AvatarMenu />}
    </header>
  );
}
