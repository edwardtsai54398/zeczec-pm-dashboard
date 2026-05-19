import { useState } from 'react';
import { dBt, fmt, pD } from '../lib/dateUtils.js';
import { BT, PH } from '../lib/tasks.js';
import { mkTasks } from '../lib/schedulerV2.js';
import { getTone } from './shared.js';

export function ProjectPage({ projects, sel, setSel, onUpdate, miles, onAdd, onDelete }) {
  const p = projects.find((x) => x.id === sel);
  if (!projects.length) {
    return <div className="empty"><i className="ti ti-folder-plus"></i>還沒有專案，按右上「新增專案」開始</div>;
  }

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
              <span className="badge">{pp.mode === "forward" ? "正推" : "反推"}</span>
            </button>
          );
        })}
        <button className="proj-tab" onClick={onAdd}>
          <i className="ti ti-plus" style={{ fontSize: 14 }}></i> 新增
        </button>
      </div>

      {p
        ? <ProjectDetail p={p} onUpdate={onUpdate} miles={miles[sel]} onDelete={() => onDelete(p.id)} />
        : <div className="empty">選擇專案</div>}
    </div>
  );
}

function ProjectDetail({ p, onUpdate, miles, onDelete }) {
  const [exp, setExp] = useState({});
  const tone = getTone(p);

  const gr = {};
  (p.tasks || []).forEach((t) => {
    const b = BT.find((x) => x.id === t.id);
    if (!b) return;
    if (!gr[b.p]) gr[b.p] = [];
    gr[b.p].push({ ...b, enabled: t.enabled });
  });

  const tog = (id) => onUpdate({
    ...p,
    tasks: p.tasks.map((t) => t.id === id ? { ...t, enabled: !t.enabled } : t),
  });

  const totalHours = p.tasks.reduce((s, t) => {
    if (!t.enabled) return s;
    const b = BT.find((x) => x.id === t.id);
    return s + (p.template === "pm" ? (b?.pm || 0) : (b?.h || 0));
  }, 0);

  const u = (field) => (value) => onUpdate({ ...p, [field]: value });

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 12, height: 12, borderRadius: 50, background: tone.bg, border: `2px solid ${tone.ink}` }} />
          <input
            value={p.name}
            onChange={(e) => onUpdate({ ...p, name: e.target.value })}
            style={{ fontSize: 22, fontWeight: 500, border: "none", background: "transparent", outline: "none", flex: 1, color: "var(--ink)", fontFamily: "var(--font-sans)", letterSpacing: "-0.01em" }}
          />
          <div className="tpl-toggle" style={{ marginBottom: 0 }}>
            <button onClick={() => onUpdate({ ...p, template: "full", tasks: mkTasks("full") })}
                    className={p.template === "full" ? "active" : ""}>全自操</button>
            <button onClick={() => {
              const ts = mkTasks("pm").map((t) => ({ ...t, enabled: t.enabled && !(BT.find((x) => x.id === t.id) || {}).sh }));
              onUpdate({ ...p, template: "pm", tasks: ts });
            }} className={p.template === "pm" ? "active" : ""}>PM 模式</button>
          </div>
          <button className="iconbtn-x" onClick={onDelete} title="刪除專案">
            <i className="ti ti-trash"></i>
          </button>
        </div>

        <textarea className="text-in" rows={2}
                  placeholder="專案備註…例如：「電檢通過，可立刻啟動」"
                  value={p.notes || ""} onChange={(e) => onUpdate({ ...p, notes: e.target.value })} />

        <div style={{ height: 18 }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>排程模式</div>
        <div className="mode-card">
          {[
            { k: "forward",  l: "A · 正推", d: "啟動日 → 推算上線" },
            { k: "backward", l: "B · 反推", d: "上線日 → 反推啟動" },
          ].map((x) => (
            <button key={x.k} onClick={() => onUpdate({ ...p, mode: x.k })}
                    className={`mode-opt ${p.mode === x.k ? "active" : ""}`}>
              <div className="lbl">{x.l}</div>
              <div className="desc">{x.d}</div>
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div className="date-cell tone-lavender">
            <div className="lbl">專案啟動日</div>
            <input type="date" value={p.startDate || ""} onChange={(e) => u("startDate")(e.target.value)} />
            {p.mode === "backward" && !p.startDate && miles?.calcStart && (
              <div className="hint" style={{ color: "var(--t-lavender-ink)" }}>建議 {fmt(miles.calcStart)} 起</div>
            )}
          </div>
          <div className="date-cell" style={{ background: "white", border: "1px solid var(--border)", borderLeft: "3px solid var(--ink)" }}>
            <div className="lbl">預估總工時</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 28, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              {totalHours}<span style={{ fontSize: 14, color: "var(--ink-2)" }}>hr</span>
            </div>
            <div className="hint" style={{ color: "var(--ink-3)", fontWeight: 400 }}>≈ {Math.ceil(totalHours / 8)} 工作天</div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>走期設定</div>
        <div className="date-grid" style={{ marginBottom: 10 }}>
          <div className="date-cell tone-lime">
            <div className="lbl">問卷上線日</div>
            <input type="date" value={p.surveyStart || ""} onChange={(e) => u("surveyStart")(e.target.value)} />
            {!p.surveyStart && miles?.eSv && <div className="hint" style={{ color: "var(--t-lime-ink)" }}>最快 {fmt(miles.eSv)}</div>}
          </div>
          <div className="date-cell tone-lime">
            <div className="lbl">問卷結束日</div>
            <input type="date" value={p.surveyEnd || ""} onChange={(e) => u("surveyEnd")(e.target.value)} />
          </div>
        </div>
        <div className="date-grid">
          <div className="date-cell tone-peach">
            <div className="lbl">募資上線日</div>
            <input type="date" value={p.campaignStart || ""} onChange={(e) => u("campaignStart")(e.target.value)} />
            {!p.campaignStart && miles?.eCp && <div className="hint" style={{ color: "var(--t-peach-ink)" }}>最快 {fmt(miles.eCp)}</div>}
          </div>
          <div className="date-cell tone-peach">
            <div className="lbl">募資結束日</div>
            <input type="date" value={p.campaignEnd || ""} onChange={(e) => u("campaignEnd")(e.target.value)} />
          </div>
        </div>
        {p.campaignStart && p.campaignEnd && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8, textAlign: "right" }}>
            募資期 {dBt(pD(p.campaignStart), pD(p.campaignEnd)) + 1} 天
            {p.surveyStart && p.surveyEnd && ` · 問卷期 ${dBt(pD(p.surveyStart), pD(p.surveyEnd)) + 1} 天`}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <span>任務清單</span>
          <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 400 }}>
            {p.tasks.filter((t) => t.enabled).length} / {p.tasks.length} 啟用
          </span>
        </div>
        <p className="card-sub">勾選要納入排程的任務，工時依模板自動切換</p>

        {Object.entries(gr).map(([ph, ts]) => {
          const phMeta = PH[ph] || { n: ph, c: "#888" };
          const open = exp[ph];
          const enabled = ts.filter((x) => x.enabled).length;
          return (
            <div key={ph} className="phase-block">
              <div className={`phase-head ${open ? "open" : ""}`}
                   onClick={() => setExp((v) => ({ ...v, [ph]: !v[ph] }))}>
                <span className="swatch" style={{ background: phMeta.c }}></span>
                <span className="name">{phMeta.n}</span>
                <span className="count">{enabled} / {ts.length}</span>
                <i className="ti ti-chevron-down ti-chev"></i>
              </div>
              {open && (
                <div className="phase-body">
                  {ts.map((t) => (
                    <label key={t.id} className={`phase-row ${!t.enabled ? "disabled" : ""}`}>
                      <input type="checkbox" checked={t.enabled} onChange={() => tog(t.id)} />
                      <span className="pid">{t.id}</span>
                      <span className="pname">{t.n}</span>
                      <span className="pmeta">
                        {(p.template === "pm" ? t.pm : t.h) > 0 ? `${p.template === "pm" ? t.pm : t.h}h` : ""}
                        {t.w > 0 ? ` +${t.w}d` : ""}
                      </span>
                      {t.dl && (
                        <span className={`ptag ${t.dl}`}>{t.dl === "sv" ? "問卷前" : "開賣前"}</span>
                      )}
                      {t.ns && (
                        <span className="ptag ns">優先</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
