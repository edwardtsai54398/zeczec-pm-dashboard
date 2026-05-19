import avatarImg from "../assets/avatar.jpg";

export function Topbar({ projectCount, showAvatar }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-name">募資專案管理</span>
        <span style={{
          fontSize: 11, color: "var(--ink-3)", fontWeight: 500,
          padding: "3px 9px", background: "white", borderRadius: 999,
          border: "1px solid var(--border)",
        }}>
          v2 · {projectCount} 個專案
        </span>
      </div>
      <div className="topbar-spacer"></div>
      <button className="icon-pill" title="搜尋">
        <i className="ti ti-search"></i>
      </button>
      {showAvatar && <div className="avatar" title="使用者"><img src={avatarImg} alt="使用者" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /></div>}
    </header>
  );
}
