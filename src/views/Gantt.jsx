import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { dBt, addD, fmt, pD, isBO as checkBO } from '../lib/dateUtils.js';
import { TONES } from './shared.js';
import { BT } from '../lib/tasks.js';
import { DateInput } from '../components/DateInput.jsx';

function TaskEditModal({ state, projects, data, onSave, onClose }) {
  const proj = projects.find((p) => p.id === state.pid);
  const projTask = (proj?.tasks || []).find((t) => t.id === state.taskId);
  const scheduled = data[state.pid]?.[state.taskId];
  const btTask = BT.find((b) => b.id === state.taskId);
  const isPM = proj?.template === 'pm';
  const defaultHours = isPM ? (btTask?.pm ?? 0) : (btTask?.h ?? 0);
  const defaultWait = btTask?.w ?? 0;

  const [hoursVal, setHoursVal] = useState(
    projTask?.pinnedHours != null ? String(projTask.pinnedHours) : ''
  );
  const [waitVal, setWaitVal] = useState(
    projTask?.pinnedWait != null ? String(projTask.pinnedWait) : ''
  );
  const [pinEnabled, setPinEnabled] = useState(!!projTask?.pinnedStart);
  const [pinDate, setPinDate] = useState(projTask?.pinnedStart || '');

  const effectiveStart = scheduled?.start ? new Date(scheduled.start) : null;
  const pinD = pinEnabled && pinDate ? pD(pinDate) : null;
  // If effectiveStart equals the previously saved pin date, the pin itself caused that date
  // (not a dependency constraint), so moving the pin earlier should not trigger a warning.
  const oldPinD = projTask?.pinnedStart ? pD(projTask.pinnedStart) : null;
  const pinWasCausingEffectiveStart = oldPinD && effectiveStart && +effectiveStart === +oldPinD;
  const isPinOverridden = pinD && effectiveStart && effectiveStart > pinD && !pinWasCausingEffectiveStart;

  const handleSave = () => {
    onSave(state.pid, state.taskId, {
      pinnedStart: pinEnabled && pinDate ? pinDate : null,
      pinnedHours: hoursVal !== '' ? Number(hoursVal) : null,
      pinnedWait:  waitVal  !== '' ? Number(waitVal)  : null,
    });
    onClose();
  };

  return (
    <div className="g2-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="g2-modal">
        <div className="g2-modal-header">
          <div className="g2-modal-title">{scheduled?.n}</div>
          <div className="g2-modal-sub">{fmt(scheduled?.start)} – {fmt(scheduled?.end)}</div>
        </div>

        <div className="g2-modal-info">
          <span><span className="g2-modal-info-label">預設工時</span>{defaultHours}h</span>
          <span><span className="g2-modal-info-label">預設等待天數</span>{defaultWait} 天</span>
        </div>

        <div className="g2-modal-body">
          <div className="g2-modal-field">
            <label className="g2-modal-label">新的工時（小時）</label>
            <input
              type="number" min="0" step="0.5"
              className="g2-modal-input"
              placeholder={`預設 ${defaultHours}h`}
              value={hoursVal}
              onChange={(e) => setHoursVal(e.target.value)}
            />
          </div>
          <div className="g2-modal-field">
            <label className="g2-modal-label">新的等待天數（工作天）</label>
            <input
              type="number" min="0" step="1"
              className="g2-modal-input"
              placeholder={`預設 ${defaultWait} 天`}
              value={waitVal}
              onChange={(e) => setWaitVal(e.target.value)}
            />
          </div>
          <div className="g2-modal-field">
            <label className="g2-pin-row" style={{ margin: 0 }}>
              <input type="checkbox" checked={pinEnabled} onChange={(e) => setPinEnabled(e.target.checked)} />
              <span className="g2-modal-label" style={{ margin: 0 }}>固定開始日期</span>
              {pinEnabled && (
                <DateInput className="g2-pin-date" style={{ marginLeft: 'auto' }}
                  value={pinDate} onChange={(e) => setPinDate(e.target.value)} />
              )}
            </label>
            {isPinOverridden && (
              <div className="g2-pin-warn" style={{ marginTop: 6 }}>
                <i className="ti ti-alert-triangle"></i>
                依賴項目較晚結束，釘選日已被自動延後
              </div>
            )}
          </div>
        </div>

        <div className="g2-modal-footer">
          <button className="g2-pin-btn" onClick={onClose}>取消</button>
          <button className="g2-pin-btn primary" onClick={handleSave}>儲存並重算</button>
        </div>
      </div>
    </div>
  );
}

const WEEKEND_BAR_TASKS = new Set(['7.3', '7.5', '7.7', '7.8', '7.10', '7.12', '7.14', '7.16', '7.18', '7.20']);

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

function barSegments(startD, endD, gridStart, allowWeekends = false) {
  if (!startD || !endD) return [];
  const gs = new Date(gridStart); gs.setHours(0, 0, 0, 0);
  const end = new Date(endD); end.setHours(0, 0, 0, 0);
  if (isNaN(gs) || isNaN(end)) return [];

  const segments = [];
  let segStart = null;
  let cur = new Date(startD); cur.setHours(0, 0, 0, 0);

  while (cur <= end) {
    const dow = cur.getDay();
    const isWD = allowWeekends || (dow !== 0 && dow !== 6);
    if (isWD) {
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
    let lastD = new Date(end);
    if (!allowWeekends) {
      while (lastD.getDay() === 0 || lastD.getDay() === 6) lastD.setDate(lastD.getDate() - 1);
    }
    if (lastD >= segStart) {
      const cs = Math.round((segStart - gs) / 864e5);
      const span = Math.round((lastD - segStart) / 864e5) + 1;
      if (span > 0) segments.push({ cs, span });
    }
  }

  return segments;
}

export function Gantt({ projects, data, onPinUpdate, settings }) {
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
  const [pinState, setPinState] = useState(null);

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
    const bl = settings?.blackouts || [];
    const arr = [];
    for (let i = 0; i < VIEW_DAYS; i++) {
      const d = addD(viewStart, i);
      const dow = d.getDay();
      const isWE = dow === 0 || dow === 6;
      arr.push({ date: d, isWE, dow, isBO: !isWE && checkBO(d, bl) });
    }
    return arr;
  }, [viewStart, VIEW_DAYS, settings]);

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

  const handlePeriodBarEnter = useCallback((e, bar) => {
    setTip({ x: e.clientX, y: e.clientY, periodBar: bar });
  }, []);

  const handleBarDblClick = useCallback((e, t, p) => {
    e.stopPropagation();
    setTip(null);
    setPinState({ pid: p.id, taskId: t.id });
  }, []);

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

  const { periodBars, pNumLanes } = useMemo(() => {
    const bars = [];
    for (const p of selectedProjects) {
      const tk = toneKey(p);
      if (p.surveyStart && p.surveyEnd)
        bars.push({ p, tk, type: 'survey', label: `${p.name}--問卷期間`, start: p.surveyStart, end: p.surveyEnd });
      if (p.campaignStart && p.campaignEnd)
        bars.push({ p, tk, type: 'campaign', label: `${p.name}--募資期間`, start: p.campaignStart, end: p.campaignEnd });
    }
    bars.sort((a, b) => new Date(a.start) - new Date(b.start));
    const laneEnds = [];
    bars.forEach(bar => {
      let placed = false;
      for (let l = 0; l < laneEnds.length; l++) {
        if (new Date(bar.start) >= laneEnds[l]) {
          bar.lane = l; laneEnds[l] = new Date(bar.end); placed = true; break;
        }
      }
      if (!placed) { bar.lane = laneEnds.length; laneEnds.push(new Date(bar.end)); }
    });
    return { periodBars: bars, pNumLanes: laneEnds.length };
  }, [selectedProjects]);

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

  const hasPeriodBars = periodBars.length > 0;
  const pPAD = 4, pGAP = 2;
  const pIsMulti = pNumLanes > 1;
  const pBarH = pIsMulti ? Math.floor((40 - pPAD * 2 - pGAP * (pNumLanes - 1)) / pNumLanes) : undefined;

  return (
    <div className="g2-page">
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
                <span className="g2-swatch ms"></span>
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
                  {hasPeriodBars && (
                    <div className="g2-period-label">期間</div>
                  )}
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
                  {hasPeriodBars && (
                    <div className="g2-period-label">期間</div>
                  )}
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
                      className={`g2-date-cell${d.isWE ? ' weekend' : d.isBO ? ' blackout' : ''}${isToday ? ' today' : ''}`}
                      style={{ width: COL_W }}>
                      {isToday && <span className="g2-today-bubble">今天</span>}
                      <span className="g2-day-num">{d.date.getDate()}</span>
                      <span className="g2-day-name">{DAY_NAMES[d.dow]}</span>
                    </div>
                  );
                })}
              </div>

              {hasPeriodBars && (
                <div className="g2-period-band">
                  {gridDays.map((d, i) => (
                    <div key={i} className={`g2-grid-cell${d.isWE ? ' weekend' : d.isBO ? ' blackout' : ''}`} style={{ width: COL_W }} />
                  ))}
                  {periodBars.map((bar, bi) =>
                    barSegments(bar.start, bar.end, viewStart, true).map((seg, si) => (
                      <div key={`${bi}-${si}`}
                        className={`g2-bar ${bar.tk}`}
                        style={{
                          left: seg.cs * COL_W, width: seg.span * COL_W,
                          ...(pIsMulti ? { top: pPAD + bar.lane * (pBarH + pGAP), height: pBarH, bottom: 'auto' } : {}),
                        }}
                        onMouseEnter={(e) => handlePeriodBarEnter(e, bar)}
                        onMouseLeave={handleBarLeave}
                      />
                    ))
                  )}
                </div>
              )}

              <div className={`g2-track-body${overlayMode ? ' g2-overlay' : ''}`}>

                {todayVisible && (
                  <div className="g2-today-line"
                    style={{ left: todayOffset * COL_W + COL_W / 2 }} />
                )}

                {milestones.map((ms, i) => (
                  <div key={i} className={`g2-milestone ${ms.tk}`}
                    style={{ left: ms.off * COL_W + COL_W / 2 }}
                    title={`${ms.pName}: ${ms.label}`}>
                    <span className="g2-milestone-label">
                      {ms.pName}<br />{ms.label}
                    </span>
                  </div>
                ))}

                {overlayMode ? (
                  overlayRows.map(({ id, bars }) => {
                    const hasTimeOverlap = bars.length >= 2 && bars.some((a, ai) =>
                      bars.some((b, bi) => {
                        if (bi <= ai) return false;
                        return new Date(a.t.start) <= new Date(b.t.end) &&
                               new Date(b.t.start) <= new Date(a.t.end);
                      })
                    );
                    const isMulti = hasTimeOverlap;
                    const N = bars.length;
                    const PAD = 4, GAP = 2;
                    const barH = isMulti ? Math.floor((40 - PAD * 2 - GAP * (N - 1)) / N) : undefined;
                    return (
                      <div key={id} className="g2-task-row">
                        {gridDays.map((d, i) => (
                          <div key={i} className={`g2-grid-cell${d.isWE ? ' weekend' : d.isBO ? ' blackout' : ''}`}
                            style={{ width: COL_W }} />
                        ))}
                        {bars.map(({ p, t, tk }, barIdx) => {
                          const barTop = isMulti ? PAD + barIdx * (barH + GAP) : undefined;
                          return (
                            <div key={p.id}>
                              {barSegments(t.start, t.end, viewStart, WEEKEND_BAR_TASKS.has(t.id)).map((seg, si) => (
                                <div key={`${p.id}-${si}`}
                                  className={`g2-bar ${tk}${t.hours === 0 ? ' placeholder' : ''}${isMulti ? ' split' : ''}`}
                                  style={{
                                    left: seg.cs * COL_W + 2,
                                    width: seg.span * COL_W - 4,
                                    ...(isMulti ? { top: barTop, height: barH, bottom: 'auto' } : {}),
                                  }}
                                  onMouseEnter={(e) => handleBarEnter(e, t, p)}
                                  onMouseLeave={handleBarLeave}
                                  onDoubleClick={(e) => handleBarDblClick(e, t, p)}>
                                  {!isMulti && <span className="g2-bar-dot"></span>}
                                  {!isMulti && <span className="g2-bar-name">{si === 0 ? t.n : '續'}</span>}
                                </div>
                              ))}
                              {!isMulti && t.waitEnd && barSegments(addD(t.end, 1), t.waitEnd, viewStart).map((seg, si) => (
                                <div key={`w${p.id}-${si}`}
                                  className="g2-bar-wait"
                                  style={{ left: seg.cs * COL_W + 2, width: seg.span * COL_W - 4 }} />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                ) : (
                  normalGroups.map(({ p, tasks, tk }) => (
                    <div key={p.id}>
                      <div className={`g2-proj-row ${tk}`}>
                        {gridDays.map((d, i) => (
                          <div key={i} className={`g2-grid-cell${d.isWE ? ' weekend dim' : d.isBO ? ' blackout dim' : ''}`}
                            style={{ width: COL_W }} />
                        ))}
                      </div>
                      {tasks.map(t => {
                        const projTask = (p.tasks || []).find(pt => pt.id === t.id);
                        const isPinned = !!projTask?.pinnedStart;
                        const pinD = isPinned ? pD(projTask.pinnedStart) : null;
                        const pinOverridden = isPinned && pinD && new Date(t.start) > pinD;
                        return (
                          <div key={t.id} className="g2-task-row">
                            {gridDays.map((d, i) => (
                              <div key={i} className={`g2-grid-cell${d.isWE ? ' weekend' : d.isBO ? ' blackout' : ''}`}
                                style={{ width: COL_W }} />
                            ))}
                            {barSegments(t.start, t.end, viewStart, WEEKEND_BAR_TASKS.has(t.id)).map((seg, si) => (
                              <div key={si}
                                className={`g2-bar ${tk}${t.hours === 0 ? ' placeholder' : ''}${isPinned ? ' pinned' : ''}`}
                                style={{ left: seg.cs * COL_W + 2, width: seg.span * COL_W - 4 }}
                                onMouseEnter={(e) => handleBarEnter(e, t, p)}
                                onMouseLeave={handleBarLeave}
                                onDoubleClick={(e) => handleBarDblClick(e, t, p)}>
                                <span className="g2-bar-name">{si === 0 ? t.n : '續'}</span>
                                {si === 0 && t.hours > 0 && (
                                  <span className="g2-bar-hrs">{t.hours}h</span>
                                )}
                                {si === 0 && isPinned && (
                                  <i className={`ti ti-pin g2-pin-icon${pinOverridden ? ' warn' : ''}`}></i>
                                )}
                              </div>
                            ))}
                            {t.waitEnd && barSegments(addD(t.end, 1), t.waitEnd, viewStart).map((seg, si) => (
                              <div key={`w${si}`}
                                className="g2-bar-wait"
                                style={{ left: seg.cs * COL_W + 2, width: seg.span * COL_W - 4 }}>
                                {si === 0 && <span className="g2-bar-wait-label">等待</span>}
                              </div>
                            ))}
                          </div>
                        );
                      })}
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
            <kbd>←</kbd> <kbd>→</kbd> 切換週 <kbd>T</kbd> 回今天
          </div>
        </div>
      </div>

      {tip && !pinState && (
        <div className="g2-tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.periodBar ? (
            <>
              <strong>{tip.periodBar.label}</strong>
              <span>{tip.periodBar.p.name}</span>
              <span>{fmt(tip.periodBar.start)} – {fmt(tip.periodBar.end)}</span>
            </>
          ) : (
            <>
              <strong>{tip.task.n}</strong>
              <span>{tip.project.name}</span>
              <span>{fmt(tip.task.start)} – {fmt(tip.task.end)}</span>
              {tip.task.hours > 0 && <span>{tip.task.hours}h</span>}
            </>
          )}
        </div>
      )}

      {pinState && (
        <TaskEditModal
          state={pinState}
          projects={projects}
          data={data}
          onSave={onPinUpdate}
          onClose={() => setPinState(null)}
        />
      )}
    </div>
  );
}
