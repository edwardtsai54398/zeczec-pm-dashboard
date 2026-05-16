import { useState, useMemo } from 'react';
import { dBt, fmt, addD } from '../lib/dateUtils.js';
import { PH } from '../lib/tasks.js';
import { getTone, WEEK, greetingFor } from './shared.js';

export function Dashboard({ projects, data, miles, onAddProject, onJump }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const hr = new Date().getHours();

  const allTasks = useMemo(() => {
    const out = [];
    projects.forEach((p) => {
      Object.values(data[p.id] || {}).forEach((t) => out.push({ ...t, _proj: p }));
    });
    return out;
  }, [projects, data]);

  const tdy = [], soon = [], overdue = [];
  allTasks.forEach((t) => {
    const a = new Date(t.start), b = new Date(t.end);
    a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
    if (b < today) overdue.push(t);
    else if (a <= today && b >= today) tdy.push(t);
    else if (a > today && dBt(today, a) <= 7) soon.push(t);
  });
  soon.sort((a, b) => new Date(a.start) - new Date(b.start));

  const weekTasks = allTasks.filter((t) => {
    const a = new Date(t.start); a.setHours(0, 0, 0, 0);
    return dBt(today, a) >= -3 && dBt(today, a) <= 7 && (t.hours || 0) > 0;
  });
  const weekHours = weekTasks.reduce((s, t) => s + (t.hours || 0), 0);
  const activeProjects = projects.filter((p) => p.startDate || p.campaignStart).length;

  const timelineDays = 7;
  const timelineTasks = useMemo(() => {
    const items = [];
    allTasks.forEach((t) => {
      const s = new Date(t.start), e = new Date(t.end);
      s.setHours(0, 0, 0, 0); e.setHours(0, 0, 0, 0);
      const so = dBt(today, s), eo = dBt(today, e);
      if (eo < 0 || so > timelineDays - 1) return;
      items.push({ ...t, startIdx: Math.max(0, so), endIdx: Math.min(timelineDays - 1, eo) });
    });
    return items.sort((a, b) => a.startIdx - b.startIdx);
  }, [allTasks, today]);

  return (
    <div>
      <section className="hero">
        <div className="hero-left">
          <h1 className="greeting">
            {greetingFor(hr)}<em>,</em> <em>讓今天順利推進。</em>
          </h1>
          <p className="greeting-sub">
            今天是 {today.getMonth() + 1}/{today.getDate()} 週{WEEK[today.getDay()]} · {tdy.length} 項任務進行中 · 接下來 7 天還有 {soon.length} 項
          </p>
        </div>
        <div className="hero-right">
          <div className="stat">
            <div className="stat-label">進行中專案</div>
            <div className="stat-value">{activeProjects}<i className="ti ti-arrow-up-right"></i></div>
          </div>
          <div className="stat">
            <div className="stat-label">本週工時</div>
            <div className="stat-value">{Math.round(weekHours)}<span className="unit">hr</span><i className="ti ti-arrow-up-right"></i></div>
          </div>
          <button className="cta-primary" onClick={onAddProject}>
            <i className="ti ti-plus"></i>新增專案
          </button>
        </div>
      </section>

      <div className="dash-cards">
        {overdue.length > 0 && <OverdueCard tasks={overdue} today={today} />}
        <TodoCard tasks={tdy.concat(soon).slice(0, 6)} today={today} />
        <TimelineCard tasks={timelineTasks} today={today} days={timelineDays} />
        <MilestonesCard projects={projects} miles={miles} onJump={onJump} />
        <LoadChart allTasks={allTasks} today={today} />
      </div>
    </div>
  );
}

function MilestonesCard({ projects, miles, onJump }) {
  return (
    <div className="card ms-card">
      <div className="card-title">
        <span>里程碑</span>
        <button className="card-icon-btn" onClick={onJump} title="開啟甘特圖">
          <i className="ti ti-chart-gantt"></i>
        </button>
      </div>
      <p className="card-sub">所有專案的問卷與開賣日期</p>
      <div className="ms-bubble-stack">
        {projects.map((p) => {
          const tone = getTone(p);
          const m = miles[p.id] || {};
          return (
            <div key={p.id} className="ms-bubble">
              <div className="ms-bubble-head">
                <span className="dot" style={{ background: tone.bg }}></span>
                <span style={{ flex: 1 }}>{p.name}</span>
                <span className={`ms-mode ${p.mode === "forward" ? "forward" : "backward"}`}>
                  {p.mode === "forward" ? "正推" : "反推"}
                </span>
              </div>
              <div className="ms-row">
                <span className="lbl">問卷上線</span>
                {p.surveyStart
                  ? <span className="val">{fmt(new Date(p.surveyStart + "T00:00:00"))}</span>
                  : <span className="val pend">待定{m.eSv ? ` · 最快 ${fmt(m.eSv)}` : ""}</span>}
              </div>
              <div className="ms-row">
                <span className="lbl">募資上線</span>
                {p.campaignStart
                  ? <span className="val">{fmt(new Date(p.campaignStart + "T00:00:00"))}</span>
                  : <span className="val pend">待定{m.eCp ? ` · 最快 ${fmt(m.eCp)}` : ""}</span>}
              </div>
            </div>
          );
        })}
        {projects.length === 0 && (
          <div className="empty"><i className="ti ti-folder-open"></i>還沒有專案</div>
        )}
      </div>
    </div>
  );
}

function TimelineCard({ tasks, today, days }) {
  const colWidth = 100 / days;
  const dayLabels = Array.from({ length: days }, (_, i) => {
    const d = addD(today, i);
    return { idx: i, label: `${d.getMonth() + 1}/${d.getDate()}`, weekday: WEEK[d.getDay()], isToday: i === 0 };
  });
  const now = new Date();
  const nowPct = ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * colWidth;

  return (
    <div className="card tl-card">
      <div className="card-title">
        <span>近七日活動</span>
        <button className="card-icon-btn" title="今天"><i className="ti ti-calendar"></i></button>
      </div>
      <p className="card-sub">每個專案待辦任務的時間分布</p>

      <div className="tl-axis">
        {dayLabels.map((d) => (
          <span key={d.idx} style={{
            width: `${colWidth}%`, textAlign: "left",
            color: d.isToday ? "var(--ink)" : undefined,
            fontWeight: d.isToday ? 600 : 400,
          }}>
            {d.label} <span style={{ opacity: .55 }}>{d.weekday}</span>
          </span>
        ))}
      </div>

      <div className="tl-track-area">
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div className="tl-day-grid">{dayLabels.map((d) => <div key={d.idx} />)}</div>
          <div className="tl-now" style={{ left: `${nowPct}%` }}></div>
        </div>

        {tasks.length === 0 && (
          <div className="todo-empty" style={{ marginTop: 16 }}>未來 7 天沒有任務</div>
        )}

        {tasks.map((t, i) => {
          const tone = getTone(t._proj);
          return (
            <div key={t.id + "_" + i} className="tl-row">
              <div className="tl-bar"
                style={{
                  left: `${t.startIdx * colWidth}%`,
                  width: `calc(${(t.endIdx - t.startIdx + 1) * colWidth}% - 4px)`,
                  marginLeft: 2,
                  background: tone.bg,
                  color: tone.ink,
                }}
                title={`${t.n} · ${fmt(t.start)}-${fmt(t.end)}`}
              >
                <span className="bar-label">{t.n}</span>
                <span className="bar-proj">· {t._proj.name}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodoCard({ tasks, today }) {
  const [done, setDone] = useState({});
  return (
    <div className="card">
      <div className="card-title">
        <span>今日待辦</span>
        <button className="card-icon-btn"><i className="ti ti-arrow-up-right"></i></button>
      </div>
      <p className="card-sub">{today.getMonth() + 1}月{today.getDate()}日 · 週{WEEK[today.getDay()]}</p>
      <div className="todo-list">
        {tasks.length === 0 && <div className="todo-empty">今日空閒，可以喘口氣 ☕</div>}
        {tasks.map((t, i) => {
          const tone = getTone(t._proj);
          const k = t.id + "_" + i;
          const isDone = !!done[k];
          return (
            <div key={k} className="todo-row">
              <div className={`todo-check ${isDone ? "done" : ""}`}
                   onClick={() => setDone((d) => ({ ...d, [k]: !d[k] }))}>
                {isDone && <i className="ti ti-check" style={{ fontSize: 12 }}></i>}
              </div>
              <div className="todo-text">
                <div className={`todo-name ${isDone ? "done" : ""}`}>{t.n}</div>
                <div className="todo-meta">
                  {t._proj.name} · {fmt(t.start)}–{fmt(t.end)}{t.hours > 0 ? ` · ${t.hours}hr` : ""}
                </div>
              </div>
              <span className="todo-tag" style={{ background: tone.bg, color: tone.ink }}>
                {(PH[t.p] || {}).n || "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OverdueCard({ tasks, today }) {
  return (
    <div className="card overdue-card">
      <div className="card-title">
        <span>過期未完成</span>
        <span className="overdue-badge">{tasks.length}</span>
      </div>
      <p className="card-sub">已超過結束日期但尚未完成的任務</p>
      <div className="todo-list">
        {tasks.slice(0, 5).map((t, i) => {
          const tone = getTone(t._proj);
          const daysLate = dBt(new Date(t.end), today);
          return (
            <div key={t.id + "_" + i} className="todo-row">
              <div className="todo-text">
                <div className="todo-name">{t.n}</div>
                <div className="todo-meta">
                  {t._proj.name} · 逾期 {daysLate} 天
                </div>
              </div>
              <span className="todo-tag" style={{ background: tone.bg, color: tone.ink }}>
                {(PH[t.p] || {}).n || "—"}
              </span>
            </div>
          );
        })}
        {tasks.length > 5 && (
          <div className="todo-meta" style={{ textAlign: "center", marginTop: 8 }}>
            還有 {tasks.length - 5} 項...
          </div>
        )}
      </div>
    </div>
  );
}

function LoadChart({ allTasks, today }) {
  const days = 14, hpd = 8;

  const loads = Array.from({ length: days }, (_, i) => {
    const d = addD(today, i);
    let h = 0;
    allTasks.forEach((t) => {
      const s = new Date(t.start), e = new Date(t.end);
      s.setHours(0, 0, 0, 0); e.setHours(0, 0, 0, 0);
      const sd = dBt(today, s), ed = dBt(today, e);
      if (i < sd || i > ed) return;
      h += (t.hours || 0) / Math.max(1, ed - sd + 1);
    });
    return { i, d, h };
  });

  const max = Math.max(hpd, ...loads.map((x) => x.h)) * 1.2;
  const W = 100, H = 100;
  const pts = loads.map((p, i) => ({
    x: (i / (days - 1)) * W,
    y: H - (p.h / max) * H,
    p,
  }));
  const path = pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
  const fillPath = `${path} L ${W} ${H} L 0 ${H} Z`;
  const peakIdx = loads.reduce((bi, x, i) => x.h > loads[bi].h ? i : bi, 0);
  const peak = pts[peakIdx];

  return (
    <div className="card">
      <div className="card-title">
        <span>工時負載</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button className="card-icon-btn"><i className="ti ti-adjustments-horizontal"></i></button>
          <button className="card-icon-btn"><i className="ti ti-arrow-up-right"></i></button>
        </span>
      </div>
      <p className="card-sub">未來 14 天的每日工時（基準 {hpd}hr/天）</p>

      <div className="chart-wrap" style={{ height: 200 }}>
        <div className="chart-pill" style={{ left: `${peak.x}%`, top: `${peak.y + 8}%` }}>
          {Math.round(peak.p.h)}hr
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="loadg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-deep)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--accent-deep)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1={H - (hpd / max) * H} x2={W} y2={H - (hpd / max) * H}
                stroke="var(--ink-4)" strokeWidth="0.3" strokeDasharray="0.8 1.2" />
          <path d={fillPath} fill="url(#loadg)" />
          <path d={path} fill="none" stroke="var(--ink)" strokeWidth="0.8"
                vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((pt, i) => (
            <circle key={i} cx={pt.x} cy={pt.y} r="1.2" fill="white" stroke="var(--ink)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          ))}
          <circle cx={peak.x} cy={peak.y} r="2" fill="var(--accent-deep)" />
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-3)", marginTop: 8, padding: "0 2px" }}>
        {[0, Math.floor(days / 2), days - 1].map((i) => (
          <span key={i}>{loads[i].d.getMonth() + 1}/{loads[i].d.getDate()}</span>
        ))}
      </div>
    </div>
  );
}
