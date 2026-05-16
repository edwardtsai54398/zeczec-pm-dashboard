import { useState } from 'react';

export function SettingsPage({ settings, onUpdate }) {
  const [newBlackout, setNewBlackout] = useState({ name: "", start: "", end: "" });

  const addBlackout = () => {
    if (!newBlackout.name || !newBlackout.start || !newBlackout.end) return;
    onUpdate({
      ...settings,
      blackouts: [...settings.blackouts, { ...newBlackout, id: `b${Date.now()}` }],
    });
    setNewBlackout({ name: "", start: "", end: "" });
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title"><span>每日工時</span></div>
        <p className="card-sub">用於計算每個工作日可分配的工時上限（不包含週末與不可用時段）</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <input
            type="number" className="text-in"
            style={{ width: 100, fontSize: 24, fontWeight: 500, fontFamily: "var(--font-display)", textAlign: "center" }}
            value={settings.hoursPerDay} min={1} max={12}
            onChange={(e) => onUpdate({ ...settings, hoursPerDay: +e.target.value })}
          />
          <span style={{ fontSize: 14, color: "var(--ink-2)" }}>小時 / 工作天</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><span>不可用時段</span></div>
        <p className="card-sub">出國、員工旅遊、長假等，排程會自動避開</p>

        {settings.blackouts.map((b) => (
          <div key={b.id} className="blackout-row">
            <span style={{ width: 8, height: 8, borderRadius: 50, background: "var(--t-peach-ink)" }}></span>
            <span className="name">{b.name}</span>
            <span className="dates">{b.start} → {b.end}</span>
            <button className="iconbtn-x"
                    onClick={() => onUpdate({ ...settings, blackouts: settings.blackouts.filter((x) => x.id !== b.id) })}>
              <i className="ti ti-x"></i>
            </button>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginTop: 14, padding: 14, background: "var(--surface-tint)", borderRadius: "var(--r)" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 500 }}>名稱</div>
            <input className="text-in" placeholder="例如：員工旅遊"
                   value={newBlackout.name} onChange={(e) => setNewBlackout((v) => ({ ...v, name: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 500 }}>開始</div>
            <input className="text-in" type="date"
                   value={newBlackout.start} onChange={(e) => setNewBlackout((v) => ({ ...v, start: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 500 }}>結束</div>
            <input className="text-in" type="date"
                   value={newBlackout.end} onChange={(e) => setNewBlackout((v) => ({ ...v, end: e.target.value }))} />
          </div>
          <button className="cta-primary" style={{ padding: "10px 18px" }} onClick={addBlackout}>
            <i className="ti ti-plus"></i>新增
          </button>
        </div>
      </div>
    </div>
  );
}
