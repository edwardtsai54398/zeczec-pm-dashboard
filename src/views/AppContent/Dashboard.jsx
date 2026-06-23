import { useState, useMemo, useEffect } from 'react';
import { dBt, fmt, fmtF, pD } from '../../lib/dateUtils.js';
import { PH } from '../../lib/tasks.js';
import { getTone, WEEK, greetingFor } from './shared.js';
import RandomCat from '../../components/CatSvg/RandomCat.jsx';

export function Dashboard({ projects, data, miles, onJump }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const hr = new Date().getHours();

  const allTasks = useMemo(() => {
    const out = [];
    projects.forEach((p) => {
      Object.values(data[p.id] || {}).forEach((t) => out.push({ ...t, _proj: p }));
    });
    return out;
  }, [projects, data]);

  const kolTasks = useMemo(() => {
    const out = [];
    projects.forEach((p) => {
      (p.kols || []).forEach((k) => {
        k.milestones.forEach((ms) => {
          if (!ms.date) return;
          const d = pD(ms.date);
          if (!d) return;
          out.push({
            id: `kol_${k.id}_${ms.id}`,
            n: `${ms.name}-${k.name}`,
            start: d,
            end: d,
            hours: 0,
            p: "4",
            _proj: p,
            _isKol: true,
          });
        });
      });
    });
    return out;
  }, [projects]);

  const tdy = [], soon = [], overdue = [];
  allTasks.forEach((t) => {
    const a = new Date(t.start), b = new Date(t.end);
    a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
    if (b < today) overdue.push(t);
    else if (a <= today && b >= today) tdy.push(t);
    else if (a > today && dBt(today, a) <= 7) soon.push(t);
  });
  kolTasks.forEach((t) => {
    const a = new Date(t.start), b = new Date(t.end);
    a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
    if (a <= today && b >= today) tdy.push(t);
    else if (a > today && dBt(today, a) <= 7) soon.push(t);
  });
  tdy.sort((a, b) => new Date(a.end) - new Date(b.end));
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
    [...allTasks, ...kolTasks].forEach((t) => {
      const s = new Date(t.start), e = new Date(t.end);
      s.setHours(0, 0, 0, 0); e.setHours(0, 0, 0, 0);
      const so = dBt(today, s), eo = dBt(today, e);
      if (eo < 0 || so > timelineDays - 1) return;
      items.push({ ...t, startIdx: Math.max(0, so), endIdx: Math.min(timelineDays - 1, eo) });
    });
    return items.sort((a, b) => a.startIdx - b.startIdx);
  }, [allTasks, kolTasks, today]);

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
        <RandomCat />
        <div className="hero-right">
          <div className="stat">
            <div className="stat-label">進行中專案</div>
            <div className="stat-value">{activeProjects}<i className="ti ti-arrow-up-right"></i></div>
          </div>
          <div className="stat">
            <div className="stat-label">本週工時</div>
            <div className="stat-value">{Math.round(weekHours)}<span className="unit">hr</span><i className="ti ti-arrow-up-right"></i></div>
          </div>
        </div>
      </section>

      <div className="dash-cards">
        <TodoCard tasks={tdy} today={today} />
        {overdue.length > 0 && <OverdueCard tasks={overdue} today={today} />}
        <TimelineCard tasks={timelineTasks} today={today} />
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

function TimelineCard({ tasks, today }) {
  const todayStr = fmtF(today);
  const [done, setDone] = useState(() => loadDone(todayStr));

  useEffect(() => { saveDone(done); }, [done]);

  const toggle = (k, until) => setDone((d) => {
    
    const next = { ...d };
    if (next[k]) delete next[k]; else next[k] = until;
    return next;
  });

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
        {upcomingTasks.map((t) => {
          const tone = getTone(t._proj);
          const k = taskKey(t);
          const isDone = !!done[k];
          return (
            <div key={k} className="todo-row">
              <div className={`todo-check ${isDone ? "done" : ""}`}
                   onClick={() => toggle(k, taskUntil(t))}>
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

const TODO_DONE_KEY = "zeczec_todo_done";

function taskKey(t) {
  return (t._proj?.id || "") + "_" + t.id;
}

function taskUntil(t) {
  return fmtF(t.end);
}

function loadDone(todayStr) {
  try {
    const raw = JSON.parse(localStorage.getItem(TODO_DONE_KEY) || "{}");
    const cleaned = {};
    Object.entries(raw).forEach(([k, until]) => {
      if (typeof until === "string" && until >= todayStr) cleaned[k] = until;
    });
    return cleaned;
  } catch { return {}; }
}

function saveDone(done) {
  localStorage.setItem(TODO_DONE_KEY, JSON.stringify(done));
}

function TodoCard({ tasks, today }) {
  const todayStr = fmtF(today);

  const [done, setDone] = useState(() => loadDone(todayStr));

  useEffect(() => { saveDone(done); }, [done]);

  const toggle = (k, until) => setDone((d) => {
    const next = { ...d };
    if (next[k]) delete next[k]; else next[k] = until;
    return next;
  });

  return (
    <div className="card">
      <div className="card-title">
        <span>今日待辦</span>
        <button className="card-icon-btn"><i className="ti ti-arrow-up-right"></i></button>
      </div>
      <p className="card-sub">{today.getMonth() + 1}月{today.getDate()}日 · 週{WEEK[today.getDay()]}</p>
      <div className="todo-list">
        {tasks.length === 0 && <div className="todo-empty">今日空閒，可以喘口氣 ☕</div>}
        {tasks.map((t) => {
          const tone = getTone(t._proj);
          const k = taskKey(t);
          const isDone = !!done[k];
          const endDate = new Date(t.end); endDate.setHours(0, 0, 0, 0);
          const daysLeft = dBt(today, endDate);
          const urgent = daysLeft <= 3;
          return (
            <div key={k} className="todo-row">
              <div className={`todo-check ${isDone ? "done" : ""}`}
                   onClick={() => toggle(k, taskUntil(t))}>
                {isDone && <i className="ti ti-check" style={{ fontSize: 12 }}></i>}
              </div>
              <div className="todo-text">
                <div className={`todo-name ${isDone ? "done" : ""}`}>{t.n}</div>
                <div className="todo-meta">
                  {t._proj.name} · {fmt(t.start)}–{fmt(t.end)}{t.hours > 0 ? ` · ${t.hours}hr` : ""}
                </div>
              </div>
              <span className={`todo-days-left${urgent ? " urgent" : ""}`}>
                剩 {daysLeft} 天
              </span>
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

const OVERDUE_DONE_KEY = "zeczec_overdue_done";

function loadOverdueDone() {
  try { return JSON.parse(localStorage.getItem(OVERDUE_DONE_KEY) || "{}"); }
  catch { return {}; }
}

function OverdueCard({ tasks, today }) {
  const [dismissed, setDismissed] = useState(() => loadOverdueDone());
  const [expanded, setExpanded] = useState(false);

  const dismiss = (k) => setDismissed((d) => {
    const next = { ...d, [k]: true };
    localStorage.setItem(OVERDUE_DONE_KEY, JSON.stringify(next));
    return next;
  });

  const visible = tasks.filter((t) => !dismissed[taskKey(t)]);

  if (visible.length === 0) return null;

  const shown = expanded ? visible : visible.slice(0, 5);
  const remaining = visible.length - 5;

  return (
    <div className="card overdue-card">
      <div className="card-title">
        <span>過期未完成</span>
        <span className="overdue-badge">{visible.length}</span>
      </div>
      <p className="card-sub">已超過結束日期但尚未完成的任務</p>
      <div className="todo-list">
        {shown.map((t) => {
          const tone = getTone(t._proj);
          const daysLate = dBt(new Date(t.end), today);
          const k = taskKey(t);
          return (
            <div key={k} className="todo-row">
              <div className="todo-check" onClick={() => dismiss(k)}></div>
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
        {!expanded && remaining > 0 && (
          <div className="todo-show-more" onClick={() => setExpanded(true)}>
            還有 {remaining} 項...
          </div>
        )}
        {expanded && visible.length > 5 && (
          <div className="todo-show-more" onClick={() => setExpanded(false)}>
            收起
          </div>
        )}
      </div>
    </div>
  );
}

