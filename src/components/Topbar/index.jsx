import AvatarMenu from "../SettingsIO/AvatarMenu.jsx";
import WorkspaceSwitcher from "../WorkspaceSwitcher/index.jsx";
import styles from "./Topbar.module.css";

export default function Topbar({ projectCount, showAvatar }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-name">募資專案管理</span>
        <span className={styles.countBadge}>
          {projectCount} 個專案
        </span>
      </div>
      <div className="topbar-spacer"></div>
      <WorkspaceSwitcher />
      {showAvatar && <AvatarMenu />}
    </header>
  );
}
