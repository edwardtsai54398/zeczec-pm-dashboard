import { useState, useMemo, useCallback } from 'react';
import { dBt, fmt, pD, addD } from '../lib/dateUtils.js';
import { getTone } from './shared.js';

const ZOOM_LEVELS = [
  { key: 'week',  label: '週', dw: 90 },
  { key: 'day',   label: '日', dw: 18 },
  { key: 'hour',  label: '時', dw: 72 },
];

const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export function Gantt({ projects, data }) {
  const [zoom, setZoom] = useState('day');
  const [filter, setFilter] = useState(null);
  const [tip, setTip] = useState(null);

  const zoomCfg = ZOOM_LEVELS.find((z) => z.key === zoom);
  const dw = zoomCfg.dw;

  const visibleProjects = filter
    ? projects.filter((p) => p.id === filter)
    : projects;

  let mn = null, mx = null;
  projects.forEach((p) => {
    Object.values(data[p.id] || {}).forEach((t) => {
      const a = new Date(t.start), b = new Date(t.end);
      if (!mn || a < mn) mn = a;
      if (!mx || b > mx) mx = b;
    });
  });

  if (!mn) {
    return <div className="empty"><i className="ti ti-chart-gantt"></i>設定啟動日期後即可看到甘特圖</div>;
  }

  mn = addD(mn, -3); mx = addD(mx, 7);
  const total = dBt(mn, mx) + 1;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tOff = dBt(mn, today);

  const groups = visibleProjects
    .map((p) => {
      const s = data[p.id];
      if (!s || !Object.keys(s).length) return null;
      return { p, ts: Object.values(s).sort((a, b) => new Date(a.start) - new Date(b.start)) };
    })
    .filter(Boolean);

  const dayMeta = useMemo(() => {
    const arr = [];
    for (let i = 0; i < total; i++) {
      const d = addD(mn, i);
      const day = d.getDay();
      arr.push({ date: d, isWeekend: day === 0 || day === 6, day });
    }
    return arr;
  }, [mn, total]);

  const headers = useMemo(() => {
    if (zoom === 'week') {
      const weeks = [];
      let i = 0;
      while (i < total) {
        const d = dayMeta[i].date;
        const dow = d.getDay();
        const toMonday = dow === 0 ? 6 : dow - 1;
        const weekStart = i;
        let weekEnd = i;
        while (weekEnd + 1 < total) {
          const nd = dayMeta[weekEnd + 1].date;
          if (nd.getDay() === 1 && weekEnd > weekStart) break;
          weekEnd++;
        }
        const span = weekEnd - weekStart + 1;
        const m = d.getMonth() + 1;
        const dd = d.getDate();
        weeks.push({ key: `w${i}`, label: `${m}/${dd}`, s: weekStart, span });
        i = weekEnd + 1;
      }
      return weeks;
    }

    const mos = [];
    let c = new Date(mn);
    while (c <= mx) {
      const m = c.getMonth(), y = c.getFullYear(), k = `${y}-${m}`;
      if (!mos.length || mos[mos.length - 1].k !== k) {
        mos.push({ k, label: `${y} / ${String(m + 1).padStart(2, "0")}`, s: dBt(mn, c) });
      }
      c = addD(c, 1);
    }
    return mos.map((m, i) => {
      const nx = mos[i + 1]?.s || total;
      return { key: m.k, label: m.label, s: m.s, span: nx - m.s };
    });
  }, [zoom, mn, mx, total, dayMeta]);

  const trackWidth = zoom === 'week'
    ? headers.reduce((s, h) => s + h.span * dw / 7, 0)
    : total * dw;

  const colWidth = zoom === 'week' ? dw / 7 : dw;

  const barLeft = (startOffset) => {
    if (zoom === 'week') return startOffset * (dw / 7);
    return startOffset * dw;
  };
  const barWidth = (dur) => {
    if (zoom === 'week') return Math.max(dur * (dw / 7) - 2, 3);
    return Math.max(dur * dw - 3, 4);
  };

  const handleBarEnter = useCallback((e, t, pName) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({
      text: `${t.n}`,
      sub: `${fmt(t.start)} – ${fmt(t.end)}${t.hours ? ` · ${t.hours}hr` : ''}`,
      proj: pName,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }, []);

  const handleBarLeave = useCallback(() => setTip(null), []);

  const nameColW = 200;

  return (
    <div className="gantt-wrap">
      {/* toolbar */}
      <div className="gantt-toolbar">
        <div className="gantt-filter-group">
          <button
            className={`gantt-filter-btn ${filter === null ? 'active' : ''}`}
            onClick={() => setFilter(null)}
          >全部</button>
          {projects.map((p) => {
            const tone = getTone(p);
            return (
              <button
                key={p.id}
                className={`gantt-filter-btn ${filter === p.id ? 'active' : ''}`}
                onClick={() => setFilter(filter === p.id ? null : p.id)}
              >
                <span className="dot" style={{ background: tone.bg, border: `1.5px solid ${tone.ink}` }}></span>
                {p.name}
              </button>
            );
          })}
        </div>
        <div className="gantt-zoom-group">
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z.key}
              className={`gantt-zoom-btn ${zoom === z.key ? 'active' : ''}`}
              onClick={() => setZoom(z.key)}
            >{z.label}</button>
          ))}
        </div>
      </div>

      <div className="gantt-scroll">
        <div style={{ minWidth: nameColW + trackWidth }}>
          {/* header */}
          <div className="gantt-header">
            <div className="gantt-corner">PROJECT</div>
            <div className="gantt-months" style={{ width: trackWidth }}>
              {headers.map((h) => (
                <div key={h.key} className="gantt-month"
                  style={{ width: zoom === 'week' ? h.span * dw / 7 : h.span * dw }}>
                  {h.label}
                </div>
              ))}
            </div>
          </div>

          {/* day sub-header for day/hour modes */}
          {(zoom === 'day' || zoom === 'hour') && (
            <div className="gantt-header gantt-day-header">
              <div className="gantt-corner gantt-day-corner"></div>
              <div className="gantt-day-row" style={{ width: trackWidth }}>
                {dayMeta.map((d, i) => (
                  <div key={i}
                    className={`gantt-day-cell ${d.isWeekend ? 'weekend' : ''} ${i === tOff ? 'today' : ''}`}
                    style={{ width: colWidth }}>
                    <span className="gantt-day-num">{d.date.getDate()}</span>
                    <span className="gantt-day-wd">{WEEK_LABELS[d.day]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* body */}
          <div className="gantt-body">
            {/* vertical grid lines + weekend shading */}
            <div className="gantt-grid-layer" style={{ left: nameColW, right: 0 }}>
              {dayMeta.map((d, i) => (
                <div key={i}
                  className={`gantt-grid-col ${d.isWeekend ? 'weekend' : ''}`}
                  style={{ left: i * colWidth, width: colWidth }}
                />
              ))}
            </div>

            {/* today line */}
            {tOff >= 0 && tOff < total && (
              <div className="gantt-today" style={{ left: nameColW + tOff * colWidth }}></div>
            )}

            {groups.map(({ p, ts }) => {
              const tone = getTone(p);
              return (
                <div key={p.id}>
                  {/* project header row */}
                  <div className="gantt-rowg">
                    <div className="gantt-namecol">
                      <div className="gantt-phase-head" style={{ background: tone.bg, color: tone.ink }}>
                        <span className="sw" style={{ background: tone.ink }}></span>
                        {p.name}
                      </div>
                    </div>
                    <div className="gantt-track-col">
                      <div className="gantt-phase-row" style={{ background: `${tone.bg}55` }}>
                        {[
                          { d: p.surveyStart,   c: "var(--t-lime-ink)",  l: "問卷" },
                          { d: p.campaignStart, c: "var(--t-peach-ink)", l: "開賣" },
                          { d: p.campaignEnd,   c: "var(--t-rose-ink)",  l: "結束" },
                        ].map((x, i) => {
                          const dt = pD(x.d); if (!dt) return null;
                          const off = dBt(mn, dt);
                          return (
                            <div key={i} className="gantt-milestone"
                                 style={{ left: barLeft(off), borderLeftColor: x.c }}>
                              <span className="gantt-milestone-label" style={{ color: x.c }}>{x.l}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* task rows */}
                  {ts.map((t) => {
                    const so = dBt(mn, new Date(t.start));
                    const dur = Math.max(1, dBt(new Date(t.start), new Date(t.end)) + 1);
                    const isPlaceholder = t.hours === 0;
                    return (
                      <div className="gantt-rowg" key={t.id}>
                        <div className="gantt-namecol">
                          <div className="gantt-task-name">
                            <span style={{ fontSize: 9, color: "var(--ink-3)", marginRight: 8, minWidth: 26, fontVariantNumeric: "tabular-nums" }}>
                              {t.id}
                            </span>
                            {t.n}
                          </div>
                        </div>
                        <div className="gantt-track-col">
                          <div className="gantt-row">
                            <div className={`gantt-bar ${isPlaceholder ? "dashed" : ""}`}
                                 style={{
                                   left: barLeft(so),
                                   width: barWidth(dur),
                                   background: tone.bg,
                                 }}
                                 onMouseEnter={(e) => handleBarEnter(e, t, p.name)}
                                 onMouseLeave={handleBarLeave}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* custom tooltip */}
      {tip && (
        <div className="gantt-tooltip" style={{ left: tip.x, top: tip.y }}>
          <div className="gantt-tooltip-name">{tip.text}</div>
          <div className="gantt-tooltip-sub">{tip.sub}</div>
          <div className="gantt-tooltip-proj">{tip.proj}</div>
        </div>
      )}
    </div>
  );
}
