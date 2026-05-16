import { useState } from 'react';
import { fmtF, pD, addD } from '../lib/dateUtils.js';
import { getTone } from './shared.js';

const KOL_MILESTONES = [
  { id: "ship",   n: "寄出產品",      o: 0 },
  { id: "brief",  n: "提供 Brief",    o: 1 },
  { id: "script", n: "腳本初版",      o: 6 },
  { id: "sfb",    n: "品牌腳本回饋",  o: 8 },
  { id: "sfinal", n: "腳本確認",      o: 9 },
  { id: "acopy",  n: "影片 A copy",   o: 13 },
  { id: "afb",    n: "品牌影片回饋",  o: 15 },
  { id: "final",  n: "Final 完成",    o: 16 },
  { id: "live",   n: "上線",          o: 17 },
];

export function KOLPage({ projects, onUpdate }) {
  const [sel, setSel] = useState(projects[0]?.id || "");
  const [showForm, setShowForm] = useState(false);
  const [newKol, setNewKol] = useState({ name: "", wave: 1 });

  const p = projects.find((x) => x.id === sel);
  const kols = p?.kols || [];

  const addKol = () => {
    if (!newKol.name || !p) return;
    onUpdate({
      ...p,
      kols: [...kols, {
        id: `k${Date.now()}`,
        name: newKol.name,
        wave: newKol.wave,
        milestones: KOL_MILESTONES.map((m) => ({ id: m.id, name: m.n, date: "" })),
      }],
    });
    setNewKol({ name: "", wave: 1 });
    setShowForm(false);
  };

  const updateMilestone = (kolId, milestoneId, date) => {
    const updated = kols.map((k) => {
      if (k.id !== kolId) return k;
      const ms = k.milestones.map((m) => m.id === milestoneId ? { ...m, date } : m);
      if (milestoneId === "ship" && date) {
        const base = pD(date);
        if (base) ms.forEach((m) => {
          if (m.id !== "ship" && !m.date) {
            const def = KOL_MILESTONES.find((x) => x.id === m.id);
            if (def) m.date = fmtF(addD(base, def.o));
          }
        });
      }
      return { ...k, milestones: ms };
    });
    onUpdate({ ...p, kols: updated });
  };

  return (
    <div>
      <div className="proj-tabs">
        {projects.map((pp) => {
          const tone = getTone(pp);
          return (
            <button key={pp.id} onClick={() => setSel(pp.id)}
                    className={`proj-tab ${sel === pp.id ? "active" : ""}`}>
              <span className="dot" style={{ background: tone.bg }}></span>
              {pp.name}
              <span className="badge">{(pp.kols || []).length}</span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">
          <span>KOL 合作清單</span>
          <button className="ghost-btn" onClick={() => setShowForm(!showForm)}>
            <i className="ti ti-plus"></i>新增 KOL
          </button>
        </div>
        <p className="card-sub">填入「寄出產品」日期後，會自動推算後續里程碑</p>

        {showForm && (
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", padding: 14, background: "var(--surface-tint)", borderRadius: "var(--r)", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 500 }}>KOL 名稱</div>
              <input className="text-in" style={{ width: 160 }}
                     value={newKol.name} onChange={(e) => setNewKol((v) => ({ ...v, name: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 500 }}>波段</div>
              <select className="text-in" value={newKol.wave}
                      onChange={(e) => setNewKol((v) => ({ ...v, wave: +e.target.value }))}>
                <option value={1}>第一波</option>
                <option value={2}>第二波</option>
              </select>
            </div>
            <button className="cta-primary" style={{ padding: "10px 18px" }} onClick={addKol}>確認</button>
          </div>
        )}

        {!kols.length && !showForm && (
          <div className="todo-empty">尚未新增 KOL · 按右上「新增 KOL」</div>
        )}

        {kols.map((k) => (
          <div key={k.id} className="kol-card">
            <div className="kol-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="kol-name">{k.name}</span>
                <span className="todo-tag" style={{
                  background: k.wave === 1 ? "var(--t-peach)" : "var(--t-sky)",
                  color: k.wave === 1 ? "var(--t-peach-ink)" : "var(--t-sky-ink)",
                }}>
                  第 {k.wave} 波
                </span>
              </div>
              <button className="iconbtn-x"
                      onClick={() => onUpdate({ ...p, kols: kols.filter((x) => x.id !== k.id) })}>
                <i className="ti ti-trash"></i>
              </button>
            </div>
            <div className="kol-body">
              {k.milestones.map((ms) => (
                <div key={ms.id} className="kol-row">
                  <span className="lbl">{ms.name}</span>
                  <input type="date" value={ms.date || ""}
                         onChange={(e) => updateMilestone(k.id, ms.id, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
