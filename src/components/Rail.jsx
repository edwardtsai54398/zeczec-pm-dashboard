import { NavLink } from 'react-router-dom';
import { NAV } from '../constants.js';

export default function Rail() {
  return (
    <aside className="rail">
      <div className="rail-mark" title="募資專案管理">
        <i className="ti ti-rocket"></i>
      </div>
      <div className="rail-divider"></div>
      <nav className="rail-nav">
        {NAV.map((n) => (
          <NavLink
            key={n.k}
            to={`/${n.k}`}
            className={({ isActive }) => `rail-btn ${isActive ? "active" : ""}`}
            title={n.label}
          >
            <i className={`ti ti-${n.icon}`}></i>
          </NavLink>
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
