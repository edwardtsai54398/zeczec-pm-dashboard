import { useState, useMemo } from 'react';
import { dBt, fmt } from '../lib/dateUtils.js';
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

function TimelineCard({ tasks }) {
  const [done, setDone] = useState({});
  const upcomingTasks = tasks.filter((t) => t.startIdx > 0);

  return (
    <div className="card">
      <div className="card-title">
        <span>近七日活動</span>
        <button className="card-icon-btn" title="今天"><i className="ti ti-calendar"></i></button>
      </div>
      <p className="card-sub">未來 7 天即將開始的任務（不含今日）</p>
      <div className="todo-list">
        {upcomingTasks.length === 0 && (
          <div className="todo-empty">未來 7 天沒有新任務</div>
        )}
        {upcomingTasks.map((t, i) => {
          const tone = getTone(t._proj);
          const k = t.id + "_tl_" + i;
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

