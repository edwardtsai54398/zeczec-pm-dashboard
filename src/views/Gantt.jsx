import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { dBt, addD, fmt, pD } from '../lib/dateUtils.js';
import { getTone, TONES } from './shared.js';

const LABEL_W = 240;
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

const ZOOM_LEVELS = [
  { key: 'hour', colW: 80, viewDays: 14, label: '時', icon: 'ti-clock' },
  { key: 'day',  colW: 52, viewDays: 21, label: '日', icon: 'ti-calendar' },
  { key: 'week', colW: 24, viewDays: 42, label: '週', icon: 'ti-calendar-month' },
];

function toneKey(p) {
  if (p?.tone && TONES[p.tone]) return p.tone;
  return 'lavender';
}

function monday(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}

function barSegments(startD, endD, gridStart) {
  if (!startD || !endD) return [];
  const gs = new Date(gridStart); gs.setHours(0, 0, 0, 0);
  const end = new Date(endD); end.setHours(0, 0, 0, 0);
  if (isNaN(gs) || isNaN(end)) return [];

  const segments = [];
  let segStart = null;
  let cur = new Date(startD); cur.setHours(0, 0, 0, 0);

  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      if (!segStart) segStart = new Date(cur);
    } else if (segStart) {
      let lastWD = new Date(cur);
      lastWD.setDate(lastWD.getDate() - 1);
      while (lastWD.getDay() === 0 || lastWD.getDay() === 6) lastWD.setDate(lastWD.getDate() - 1);
      const cs = Math.round((segStart - gs) / 864e5);
      const span = Math.round((lastWD - segStart) / 864e5) + 1;
      if (span > 0) segments.push({ cs, span });
      segStart = null;
    }
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 1);
  }

  if (segStart) {
    let lastWD = new Date(end);
    while (lastWD.getDay() === 0 || lastWD.getDay() === 6) lastWD.setDate(lastWD.getDate() - 1);
    if (lastWD >= segStart) {
      const cs = Math.round((segStart - gs) / 864e5);
      const span = Math.round((lastWD - segStart) / 864e5) + 1;
      if (span > 0) segments.push({ cs, span });
    }
  }

  return segments;
}

export function Gantt({ projects, data }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const [zoomIdx, setZoomIdx] = useState(1);
  const zoom = ZOOM_LEVELS[zoomIdx];
  const COL_W = zoom.colW;
  const MIN_VIEW_DAYS = zoom.viewDays;

  const dateRange = useMemo(() => {
    let earliest = null, latest = null;
    projects.forEach(p => {
      Object.values(data[p.id] || {}).forEach(t => {
        if (t.start) {
          const s = new Date(t.start);
          if (!earliest || s < earliest) earliest = s;
        }
        if (t.end) {
          const e = new Date(t.end);
          if (!latest || e > latest) latest = e;
        }
      });
    });
    return { earliest, latest };
  }, [projects, data]);

  const [viewStart, setViewStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const VIEW_DAYS = useMemo(() => {
    if (!dateRange.latest) return MIN_VIEW_DAYS;
    const endPlusWeek = addD(dateRange.latest, 7);
    const span = dBt(viewStart, endPlusWeek);
    return Math.max(MIN_VIEW_DAYS, span + 1);
  }, [dateRange.latest, viewStart, MIN_VIEW_DAYS]);

  const [overlayMode, setOverlayMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set(projects.map(p => p.id)));
  const [tip, setTip] = useState(null);

  const toggleProject = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  };

  const selectedProjects = projects.filter(p => selected.has(p.id));

  const gridDays = useMemo(() => {
    const arr = [];
    for (let i = 0; i < VIEW_DAYS; i++) {
      const d = addD(viewStart, i);
      const dow = d.getDay();
      arr.push({ date: d, isWE: dow === 0 || dow === 6, dow });
    }
    return arr;
  }, [viewStart, VIEW_DAYS]);

  const todayOffset = dBt(viewStart, today);
  const todayVisible = todayOffset >= 0 && todayOffset < VIEW_DAYS;

  const monthLabels = useMemo(() => {
    const labels = [];
    let prevMonth = -1;
    gridDays.forEach((d, i) => {
      const m = d.date.getMonth();
      if (m !== prevMonth) {
        labels.push({ idx: i, label: `${MONTH_EN[m]} ${d.date.getFullYear()}` });
        prevMonth = m;
      }
    });
    return labels;
  }, [gridDays]);

  const scrollRef = useRef(null);

  const [dateLabel, setDateLabel] = useState(() => {
    const m = viewStart.getMonth() + 1;
    const y = viewStart.getFullYear();
    return `${y} 年 ${m} 月`;
  });

  const updateDateLabel = useCallback((scrollLeft) => {
    const dayIdx = Math.round(scrollLeft / COL_W);
    const visibleDate = addD(viewStart, dayIdx);
    const m = visibleDate.getMonth() + 1;
    const y = visibleDate.getFullYear();
    setDateLabel(`${y} 年 ${m} 月`);
  }, [viewStart, COL_W]);

  useEffect(() => {
    updateDateLabel(scrollRef.current?.scrollLeft || 0);
  }, [viewStart, updateDateLabel]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateDateLabel(el.scrollLeft);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [updateDateLabel]);

  const nextWeek = () => {
    const el = scrollRef.current;
    if (!el) return;
    const currentDayIdx = Math.round(el.scrollLeft / COL_W);
    const currentDate = addD(viewStart, currentDayIdx);
    const dow = currentDate.getDay();
    const daysToMonday = dow === 0 ? 1 : 8 - dow;
    el.scrollTo({ left: (currentDayIdx + daysToMonday) * COL_W, behavior: 'smooth' });
  };

  const prevWeek = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollLeft > 0) {
      const currentDayIdx = Math.round(el.scrollLeft / COL_W);
      const currentDate = addD(viewStart, currentDayIdx);
      const prevMon = monday(addD(currentDate, -1));
      const targetIdx = dBt(viewStart, prevMon);
      el.scrollTo({ left: Math.max(0, targetIdx * COL_W), behavior: 'smooth' });
    } else {
      setViewStart(monday(addD(viewStart, -7)));
    }
  };

  const goToToday = () => {
    setViewStart(today);
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: 0, behavior: 'smooth' });
  };

  const handleBarEnter = useCallback((e, t, p) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      task: t,
      project: p,
    });
  }, []);
  const handleBarLeave = useCallback(() => setTip(null), []);

  const normalGroups = useMemo(() => {
    return selectedProjects.map(p => {
      const tasks = Object.values(data[p.id] || {})
        .filter(t => t.start && t.end)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      return { p, tasks, tk: toneKey(p) };
    }).filter(({ tasks }) => tasks.length > 0);
  }, [selectedProjects, data]);

  const overlayRows = useMemo(() => {
    const taskMap = new Map();
    for (const p of selectedProjects) {
      const tk = toneKey(p);
      for (const [tid, t] of Object.entries(data[p.id] || {})) {
        if (!t.start || !t.end) continue;
        if (!taskMap.has(tid)) taskMap.set(tid, { id: t.id, n: t.n, bars: [] });
        taskMap.get(tid).bars.push({ p, t, tk });
      }
    }
    return [...taskMap.values()].sort((a, b) => {
      const minA = Math.min(...a.bars.map(x => new Date(x.t.start)));
      const minB = Math.min(...b.bars.map(x => new Date(x.t.start)));
      return minA - minB;
    });
  }, [selectedProjects, data]);

  const milestones = useMemo(() => {
    const ms = [];
    selectedProjects.forEach(p => {
      const tk = toneKey(p);
      const add = (d, label) => {
        const pd = pD(d);
        if (!pd) return;
        const off = dBt(viewStart, pd);
        if (off >= 0 && off < VIEW_DAYS) ms.push({ off, label, tk, pName: p.name });
      };
      add(p.surveyStart, '問卷開始');
      add(p.campaignStart, '上線日');
      add(p.campaignEnd, '結束日');
    });
    return ms;
  }, [selectedProjects, viewStart, VIEW_DAYS]);

  const totalTasks = useMemo(() => {
    let n = 0;
    selectedProjects.forEach(p => {
      n += Object.values(data[p.id] || {}).length;
    });
    return n;
  }, [selectedProjects, data]);

  const hasData = projects.some(p => Object.keys(data[p.id] || {}).length > 0);
  if (!projects.length || !hasData) {
    return (
      <div className="empty">
        <i className="ti ti-chart-gantt"></i>
        設定啟動日期後即可看到甘特圖
      </div>
    );
  }

  return (
    <div>
      <section className="g2-page-head">
        <div>
          <h1 className="g2-title">
            {projects.length}個專案<em>，</em>同時推進。
          </h1>
          <p className="g2-sub">勾選想看的專案，時間軸自動疊加比對</p>
        </div>
      </section>

      <div className="g2-filter-row">
        <span className="g2-filter-label">專案</span>
        {projects.map(p => {
          const tk = toneKey(p);
          const checked = selected.has(p.id);
          return (
            <div key={p.id}
              className={`g2-chip${checked ? ' checked' : ''} ${tk}`}
              onClick={() => toggleProject(p.id)}>
              <span className="g2-checkbox">
                {checked && <i className="ti ti-check" style={{ fontSize: 10 }}></i>}
              </span>
              <span className="g2-dot" style={{ background: `var(--t-${tk}-ink)` }}></span>
              {p.name}
            </div>
          );
        })}
        <span className="g2-filter-count">· 顯示 {selected.size} / {projects.length} 個專案</span>
        <span className="g2-filter-spacer" />
        <button className="g2-chip-mini"><i className="ti ti-filter"></i> 篩選任務</button>
        <button className="g2-chip-mini"><i className="ti ti-download"></i> 匯出</button>
      </div>

      <div className="g2-card">
        <div className="g2-toolbar">
          <div className="g2-date-nav">
            <button className="g2-nav-btn" onClick={prevWeek}>
              <i className="ti ti-chevron-left"></i>
            </button>
            <span className="g2-date-label">{dateLabel}</span>
            <button className="g2-nav-btn" onClick={nextWeek}>
              <i className="ti ti-chevron-right"></i>
            </button>
            <button className="g2-today-btn" onClick={goToToday}>
              <i className="ti ti-target" style={{ fontSize: 11, marginRight: 4 }}></i>
              回到今天
            </button>
          </div>

          <div className="g2-toolbar-right">
            <button
              className={`g2-mode-toggle${overlayMode ? ' active' : ''}`}
              onClick={() => setOverlayMode(v => !v)}>
              <span className="g2-mode-icon">
                <span className="g2-layer a"></span>
                <span className="g2-layer b"></span>
              </span>
              疊圖模式
              <i className="ti ti-arrows-shuffle" style={{ fontSize: 13, opacity: .55, marginLeft: 2 }}></i>
            </button>

            <div className="g2-legend">
              <div className="g2-legend-item">
                <span className="g2-swatch we"></span>週末
              </div>
              <div className="g2-legend-item">
                <span className="g2-swatch tl"></span>今天
              </div>
              <div className="g2-legend-item">
                <span className="g2-swatch ms"></span>里程碑
              </div>
            </div>

            <div className="g2-zoom-toggle">
              {ZOOM_LEVELS.map((z, i) => (
                <button key={z.key}
                  className={i === zoomIdx ? 'active' : ''}
                  onClick={() => setZoomIdx(i)}>
                  <i className={`ti ${z.icon}`} style={{ fontSize: 13 }}></i>{z.label}
                </button>
              ))}
            </div>

            <button className="g2-icon-sq" title="設定">
              <i className="ti ti-adjustments-horizontal"></i>
            </button>
            <button className="g2-icon-sq" title="全螢幕">
              <i className="ti ti-maximize"></i>
            </button>
          </div>
        </div>

        <div className="g2-scroll" ref={scrollRef}>
          <div className="g2-grid" style={{ minWidth: LABEL_W + COL_W * VIEW_DAYS }}>

            <aside className="g2-task-col">
              {overlayMode ? (
                <>
                  <div className="g2-col-head">任務 · 多專案疊加</div>
                  {overlayRows.map(({ id, n, bars }) => (
                    <div key={id} className="g2-task-name">
                      <span className="g2-pid">{id}</span>
                      <span className="g2-name">{n}</span>
                      <span className="g2-proj-dots">
                        {bars.map(({ p, tk }) => (
                          <span key={p.id} className={`g2-pd ${tk}`}></span>
                        ))}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="g2-col-head">任務</div>
                  {normalGroups.map(({ p, tasks, tk }) => (
                    <div key={p.id}>
                      <div className={`g2-proj-banner ${tk}`}>
                        <span className="g2-banner-dot" style={{ background: `var(--t-${tk}-ink)` }}></span>
                        {p.name}
                        <i className="ti ti-chevron-down g2-collapse"></i>
                      </div>
                      {tasks.map(t => (
                        <div key={t.id} className="g2-task-name">
                          <span className="g2-pid">{t.id}</span>
                          <span className="g2-name">{t.n}</span>
                          <span className="g2-hrs">{t.hours ? `${t.hours}h` : ''}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </aside>

            <div className="g2-track">
              <div className="g2-date-header">
                {monthLabels.map((ml, i) => (
                  <span key={i} className="g2-month-band" style={{ left: ml.idx * COL_W + 12 }}>
                    {ml.label}
                  </span>
                ))}
                {gridDays.map((d, i) => {
                  const isToday = todayVisible && i === todayOffset;
                  return (
                    <div key={i}
                      className={`g2-date-cell${d.isWE ? ' weekend' : ''}${isToday ? ' today' : ''}`}
                      style={{ width: COL_W }}>
                      {isToday && <span className="g2-today-bubble">今天</span>}
                      <span className="g2-day-num">{d.date.getDate()}</span>
                      <span className="g2-day-name">{DAY_NAMES[d.dow]}</span>
                    </div>
                  );
                })}
              </div>

              <div className={`g2-track-body${overlayMode ? ' g2-overlay' : ''}`}>

                {todayVisible && (
                  <div className="g2-today-line"
                    style={{ left: todayOffset * COL_W + COL_W / 2 }} />
                )}

                {milestones.map((ms, i) => (
                  <div key={i} className={`g2-milestone ${ms.tk}`}
                    style={{ left: ms.off * COL_W + COL_W / 2 }}
                    title={`${ms.pName}: ${ms.label}`} />
                ))}

                {overlayMode ? (
                  overlayRows.map(({ id, bars }) => (
                    <div key={id} className="g2-task-row">
                      {gridDays.map((d, i) => (
                        <div key={i} className={`g2-grid-cell${d.isWE ? ' weekend' : ''}`}
                          style={{ width: COL_W }} />
                      ))}
                      {bars.map(({ p, t, tk }) =>
                        barSegments(t.start, t.end, viewStart).map((seg, si) => (
                          <div key={`${p.id}-${si}`}
                            className={`g2-bar ${tk}${t.hours === 0 ? ' placeholder' : ''}`}
                            style={{ left: seg.cs * COL_W + 2, width: seg.span * COL_W - 4 }}
                            onMouseEnter={(e) => handleBarEnter(e, t, p)}
                            onMouseLeave={handleBarLeave}>
                            <span className="g2-bar-dot"></span>
                            <span className="g2-bar-name">{p.name.split(' ')[0]}</span>
                          </div>
                        ))
                      )}
                    </div>
                  ))
                ) : (
                  normalGroups.map(({ p, tasks, tk }) => (
                    <div key={p.id}>
                      <div className={`g2-proj-row ${tk}`}>
                        {gridDays.map((d, i) => (
                          <div key={i} className={`g2-grid-cell${d.isWE ? ' weekend dim' : ''}`}
                            style={{ width: COL_W }} />
                        ))}
                      </div>
                      {tasks.map(t => (
                        <div key={t.id} className="g2-task-row">
                          {gridDays.map((d, i) => (
                            <div key={i} className={`g2-grid-cell${d.isWE ? ' weekend' : ''}`}
                              style={{ width: COL_W }} />
                          ))}
                          {barSegments(t.start, t.end, viewStart).map((seg, si) => (
                            <div key={si}
                              className={`g2-bar ${tk}${t.hours === 0 ? ' placeholder' : ''}`}
                              style={{ left: seg.cs * COL_W + 2, width: seg.span * COL_W - 4 }}
                              onMouseEnter={(e) => handleBarEnter(e, t, p)}
                              onMouseLeave={handleBarLeave}>
                              <span className="g2-bar-name">{si === 0 ? t.n : '續'}</span>
                              {si === 0 && t.hours > 0 && (
                                <span className="g2-bar-hrs">{t.hours}h</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="g2-footer">
          <div className="g2-footer-left">
            <span>
              <i className="ti ti-info-circle"
                style={{ fontSize: 13, verticalAlign: -2, marginRight: 4 }}></i>
              共 {totalTasks} 個任務
            </span>
          </div>
          <div>
            <kbd>←</kbd> <kbd>→</kbd> 切換週　　<kbd>T</kbd> 回今天
          </div>
        </div>
      </div>

      {tip && (
        <div className="g2-tooltip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.task.n}</strong>
          <span>{tip.project.name}</span>
          <span>{fmt(tip.task.start)} – {fmt(tip.task.end)}</span>
          {tip.task.hours > 0 && <span>{tip.task.hours}h</span>}
        </div>
      )}
    </div>
  );
}
