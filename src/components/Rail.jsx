import { NAV } from '../constants.js';

export function Rail({ view, onNavigate }) {
  return (
    <aside className="rail">
      <div className="rail-mark" title="募資專案管理">
        <i className="ti ti-rocket"></i>
      </div>
      <div className="rail-divider"></div>
      <nav className="rail-nav">
        {NAV.map((n) => (
          <button
            key={n.k}
            className={`rail-btn ${view === n.k ? "active" : ""}`}
            onClick={() => onNavigate(n.k)}
            title={n.label}
          >
            <i className={`ti ti-${n.icon}`}></i>
          </button>
        ))}
      </nav>
      <div className="rail-tail">
        <button className="rail-btn" title="說明">
          <i className="ti ti-help"></i>
        </button>
      </div>
    </aside>
  );
}
