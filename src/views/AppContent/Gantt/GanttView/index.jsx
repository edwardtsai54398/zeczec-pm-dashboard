import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { dBt, addD, fmt, pD, isBO as checkBO } from '../../../../lib/dateUtils.js';
import RandomCat from '../../../../components/CatSvg/RandomCat.jsx';
import { readPreference } from '../../../../lib/preference.js';
import { useWorkspace } from '../../../../context/WorkspaceContext.jsx';
import { usePermissions } from '../../../../hooks/usePermissions.js';
import TaskEditModal from '../TaskEditModal/index.jsx';
import { toneKey, buildPeriodBars } from '../utils.js';
import styles from './GanttView.module.css';

const WEEKEND_BAR_TASKS = new Set(['7.3', '7.5', '7.7', '7.8', '7.10', '8.2', '8.4', '8.6', '8.8', '8.10']);

const LABEL_W = 240;
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// 每日欄寬與最少顯示天數(沿用原縮放「日」級距,移除縮放功能後固定為此)
const COL_W = 52;
const MIN_VIEW_DAYS = 21;

function monday(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const dayOfWeek = result.getDay();
  result.setDate(result.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  return result;
}

function barSegments(startDate, endDate, gridStart, allowWeekends = false) {
  if (!startDate || !endDate) return [];
  const gridStartDate = new Date(gridStart); gridStartDate.setHours(0, 0, 0, 0);
  const endDay = new Date(endDate); endDay.setHours(0, 0, 0, 0);
  if (isNaN(gridStartDate) || isNaN(endDay)) return [];

  const segments = [];
  let segmentStart = null;
  let cursor = new Date(startDate); cursor.setHours(0, 0, 0, 0);

  while (cursor <= endDay) {
    const dayOfWeek = cursor.getDay();
    const isWorkday = allowWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6);
    if (isWorkday) {
      if (!segmentStart) segmentStart = new Date(cursor);
    } else if (segmentStart) {
      let lastWorkday = new Date(cursor);
      lastWorkday.setDate(lastWorkday.getDate() - 1);
      while (lastWorkday.getDay() === 0 || lastWorkday.getDay() === 6) lastWorkday.setDate(lastWorkday.getDate() - 1);
      const columnStart = Math.round((segmentStart - gridStartDate) / 864e5);
      const span = Math.round((lastWorkday - segmentStart) / 864e5) + 1;
      if (span > 0) segments.push({ columnStart, span });
      segmentStart = null;
    }
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }

  if (segmentStart) {
    let lastDay = new Date(endDay);
    if (!allowWeekends) {
      while (lastDay.getDay() === 0 || lastDay.getDay() === 6) lastDay.setDate(lastDay.getDate() - 1);
    }
    if (lastDay >= segmentStart) {
      const columnStart = Math.round((segmentStart - gridStartDate) / 864e5);
      const span = Math.round((lastDay - segmentStart) / 864e5) + 1;
      if (span > 0) segments.push({ columnStart, span });
    }
  }

  return segments;
}

// 確定性亂數（mulberry32）：純函式,給貓咪佈局用,依 seed 重現,
// 避免在 render 期間呼叫 Math.random（React Compiler 不允許）。
function mulberry32(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let hash = Math.imul(state ^ (state >>> 15), 1 | state);
    hash = (hash + Math.imul(hash ^ (hash >>> 7), 61 | hash)) ^ hash;
    return ((hash ^ (hash >>> 14)) >>> 0) / 4294967296;
  };
}

// 每次「整頁載入」隨機一次的 seed、
const SESSION_CAT_SEED = (Math.random() * 4294967296) >>> 0;

export default function GanttView({ selectedProjects, onToggleMode }) {
  // 資料層直接從 context 取(比照 Dashboard / KOLPage);篩選 state 由 Gantt 容器持有。
  const { projects, sch: data, settings, updateTaskPin } = useWorkspace();
  const { can } = usePermissions();
  const canEdit = can('editGantt'); // viewer 不能訂選任務日期(double click 無效)

  const today = useMemo(() => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }, []);

  // 貓咪偏好直接讀本地快取(localStorage)。
  const preference = useMemo(readPreference, []);

  const dateRange = useMemo(() => {
    let earliest = null, latest = null;
    projects.forEach(project => {
      Object.values(data[project.id] || {}).forEach(task => {
        if (task.start) {
          const startDate = new Date(task.start);
          if (!earliest || startDate < earliest) earliest = startDate;
        }
        if (task.end) {
          const endDate = new Date(task.end);
          if (!latest || endDate > latest) latest = endDate;
        }
      });
    });
    return { earliest, latest };
  }, [projects, data]);

  const [viewStart, setViewStart] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const VIEW_DAYS = useMemo(() => {
    if (!dateRange.latest) return MIN_VIEW_DAYS;
    const endPlusWeek = addD(dateRange.latest, 7);
    const span = dBt(viewStart, endPlusWeek);
    return Math.max(MIN_VIEW_DAYS, span + 1);
  }, [dateRange.latest, viewStart]);

  const [overlayMode, setOverlayMode] = useState(false);
  const [tip, setTip] = useState(null);
  const [pinState, setPinState] = useState(null);

  const gridDays = useMemo(() => {
    const blackouts = settings?.blackouts || [];
    const cells = [];
    for (let i = 0; i < VIEW_DAYS; i++) {
      const date = addD(viewStart, i);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      cells.push({ date, isWeekend, dayOfWeek, isBlackout: !isWeekend && checkBO(date, blackouts) });
    }
    return cells;
  }, [viewStart, VIEW_DAYS, settings]);

  const todayOffset = dBt(viewStart, today);
  const todayVisible = todayOffset >= 0 && todayOffset < VIEW_DAYS;

  const monthLabels = useMemo(() => {
    const labels = [];
    let prevMonth = -1;
    gridDays.forEach((gridDay, index) => {
      const month = gridDay.date.getMonth();
      if (month !== prevMonth) {
        labels.push({ columnIndex: index, label: `${MONTH_EN[month]} ${gridDay.date.getFullYear()}` });
        prevMonth = month;
      }
    });
    return labels;
  }, [gridDays]);

  const scrollRef = useRef(null);

  const [dateLabel, setDateLabel] = useState(() => {
    const month = viewStart.getMonth() + 1;
    const year = viewStart.getFullYear();
    return `${year} 年 ${month} 月`;
  });

  const updateDateLabel = useCallback((scrollLeft) => {
    const dayIndex = Math.round(scrollLeft / COL_W);
    const visibleDate = addD(viewStart, dayIndex);
    const month = visibleDate.getMonth() + 1;
    const year = visibleDate.getFullYear();
    setDateLabel(`${year} 年 ${month} 月`);
  }, [viewStart]);

  useEffect(() => {
    updateDateLabel(scrollRef.current?.scrollLeft || 0);
  }, [viewStart, updateDateLabel]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onScroll = () => updateDateLabel(element.scrollLeft);
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [updateDateLabel]);

  const nextWeek = () => {
    const element = scrollRef.current;
    if (!element) return;
    const currentDayIndex = Math.round(element.scrollLeft / COL_W);
    const currentDate = addD(viewStart, currentDayIndex);
    const dayOfWeek = currentDate.getDay();
    const daysToMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    element.scrollTo({ left: (currentDayIndex + daysToMonday) * COL_W, behavior: 'smooth' });
  };

  const prevWeek = () => {
    const element = scrollRef.current;
    if (!element) return;
    if (element.scrollLeft > 0) {
      const currentDayIndex = Math.round(element.scrollLeft / COL_W);
      const currentDate = addD(viewStart, currentDayIndex);
      const prevMonday = monday(addD(currentDate, -1));
      const targetIndex = dBt(viewStart, prevMonday);
      element.scrollTo({ left: Math.max(0, targetIndex * COL_W), behavior: 'smooth' });
    } else {
      setViewStart(monday(addD(viewStart, -7)));
    }
  };

  const goToToday = () => {
    setViewStart(today);
    const element = scrollRef.current;
    if (element) element.scrollTo({ left: 0, behavior: 'smooth' });
  };

  const handleBarEnter = useCallback((event, task, project) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      task,
      project,
    });
  }, []);
  const handleBarLeave = useCallback(() => setTip(null), []);

  const handlePeriodBarEnter = useCallback((event, bar) => {
    setTip({ x: event.clientX, y: event.clientY, periodBar: bar });
  }, []);

  const handleBarDblClick = useCallback((event, task, project) => {
    event.stopPropagation();
    if (!canEdit) return; // 唯讀:double click 不開啟訂選彈窗
    setTip(null);
    setPinState({ pid: project.id, taskId: task.id });
  }, [canEdit]);

  const normalGroups = useMemo(() => {
    return selectedProjects.map(project => {
      const tasks = Object.values(data[project.id] || {})
        .filter(task => task.start && task.end)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      return { project, tasks, tone: toneKey(project) };
    }).filter(({ tasks }) => tasks.length > 0);
  }, [selectedProjects, data]);

  const overlayRows = useMemo(() => {
    const taskMap = new Map();
    for (const project of selectedProjects) {
      const tone = toneKey(project);
      for (const [taskId, task] of Object.entries(data[project.id] || {})) {
        if (!task.start || !task.end) continue;
        if (!taskMap.has(taskId)) taskMap.set(taskId, { id: task.id, name: task.n, bars: [] });
        taskMap.get(taskId).bars.push({ project, task, tone });
      }
    }
    return [...taskMap.values()].sort((a, b) => {
      const minStartA = Math.min(...a.bars.map(bar => new Date(bar.task.start)));
      const minStartB = Math.min(...b.bars.map(bar => new Date(bar.task.start)));
      return minStartA - minStartB;
    });
  }, [selectedProjects, data]);

  // 在甘特條的空白格隨機放 5~7 隻裝飾貓。佔用表依「實際 DOM 渲染順序」逐 row 建立,
  // 切換疊圖 / 換週 / 縮放都會重算重排。嚴格不重疊,放不下就少放。
  // 用 seeded PRNG（mulberry32）保持 render 純淨:依 deps 重現、re-render 不亂跳。
  const catPlacements = useMemo(() => {
    const catEnabled = preference.catEnabled;
    const catCount = preference.catCount;
    if (!catEnabled) return [];

    // 1. 建立佔用表:每列是 banner（整列禁放）或 { columns:Set<欄位> }
    const rows = [];
    const markColumns = (columns, start, end, allowWeekends = false) => {
      barSegments(start, end, viewStart, allowWeekends).forEach(segment => {
        for (let column = segment.columnStart; column < segment.columnStart + segment.span; column++) {
          if (column >= 0 && column < VIEW_DAYS) columns.add(column);
        }
      });
    };
    if (overlayMode) {
      overlayRows.forEach(({ bars }) => {
        const columns = new Set();
        bars.forEach(({ task }) => {
          markColumns(columns, task.start, task.end, WEEKEND_BAR_TASKS.has(task.id));
          if (task.waitEnd) markColumns(columns, addD(task.end, 1), task.waitEnd);
        });
        rows.push({ columns });
      });
    } else {
      normalGroups.forEach(({ tasks }) => {
        rows.push({ full: true }); // 專案 banner 列整列不放
        tasks.forEach(task => {
          const columns = new Set();
          markColumns(columns, task.start, task.end, WEEKEND_BAR_TASKS.has(task.id));
          if (task.waitEnd) markColumns(columns, addD(task.end, 1), task.waitEnd);
          rows.push({ columns });
        });
      });
    }

    const rowCount = rows.length;
    if (rowCount === 0 || VIEW_DAYS === 0) return [];

    // 2. 隨機放置（嚴格不重疊:含彼此與甘特條）。seed 由「版面 + 本次載入的隨機種子」衍生:
    //    切換疊圖 / 換週 / 縮放 → 版面變 → 重新散佈以避免壓到甘特條;同版面 re-render
    //    或切出分頁再切回 → seed 不變 → 位置穩定。重新整理頁面 → SESSION_CAT_SEED 變 → 位置不同。
    let occupiedCount = 0;
    rows.forEach(row => { occupiedCount += row.full ? VIEW_DAYS : row.columns.size; });
    const seed = (overlayMode ? 1 : 0) * 2654435761 + rowCount * 40503 + VIEW_DAYS * 769 +
      COL_W * 97 + occupiedCount * 13 + (viewStart.getTime() / 864e5 | 0) + SESSION_CAT_SEED;
    const rng = mulberry32(seed);

    const ROW_H = 40;
    const targetCount = catCount;
    const placed = [];
    const fits = (rowStart, columnStart, rowsNeed, columnsNeed) => {
      if (rowStart + rowsNeed > rowCount || columnStart + columnsNeed > VIEW_DAYS) return false;
      for (let rowIndex = rowStart; rowIndex < rowStart + rowsNeed; rowIndex++) {
        const row = rows[rowIndex];
        if (row.full) return false;
        for (let columnIndex = columnStart; columnIndex < columnStart + columnsNeed; columnIndex++) {
          if (row.columns.has(columnIndex)) return false;
        }
      }
      return true;
    };
    const occupy = (rowStart, columnStart, rowsNeed, columnsNeed) => {
      for (let rowIndex = rowStart; rowIndex < rowStart + rowsNeed; rowIndex++) {
        for (let columnIndex = columnStart; columnIndex < columnStart + columnsNeed; columnIndex++) rows[rowIndex].columns.add(columnIndex);
      }
    };
    for (let catIndex = 0; catIndex < targetCount; catIndex++) {
      const size = Math.round(100 + rng() * 50); // 100~150
      const columnsNeed = Math.ceil(size / COL_W);
      const rowsNeed = Math.ceil(size / ROW_H);
      for (let attempt = 0; attempt < 30; attempt++) {
        const rowStart = Math.floor(rng() * Math.max(1, rowCount - rowsNeed + 1));
        const columnStart = Math.floor(rng() * Math.max(1, VIEW_DAYS - columnsNeed + 1));
        if (!fits(rowStart, columnStart, rowsNeed, columnsNeed)) continue;
        occupy(rowStart, columnStart, rowsNeed, columnsNeed);
        placed.push({
          key: `${overlayMode ? 'o' : 'n'}-${catIndex}-${rowStart}-${columnStart}`,
          left: columnStart * COL_W,
          top: rowStart * ROW_H,
          size,
        });
        break;
      }
    }
    return placed;
  }, [overlayMode, normalGroups, overlayRows, viewStart, VIEW_DAYS, preference.catEnabled, preference.catCount]);

  const milestones = useMemo(() => {
    const result = [];
    selectedProjects.forEach(project => {
      const tone = toneKey(project);
      const add = (dateString, label) => {
        const parsedDate = pD(dateString);
        if (!parsedDate) return;
        const offset = dBt(viewStart, parsedDate);
        if (offset >= 0 && offset < VIEW_DAYS) result.push({ offset, label, tone, projectName: project.name });
      };
      add(project.surveyStart, '問卷開始');
      add(project.campaignStart, '上線日');
      add(project.campaignEnd, '結束日');
    });
    return result;
  }, [selectedProjects, viewStart, VIEW_DAYS]);

  const { periodBars, periodLaneCount } = useMemo(
    () => buildPeriodBars(selectedProjects),
    [selectedProjects],
  );

  const totalTasks = useMemo(() => {
    let total = 0;
    selectedProjects.forEach(project => {
      total += Object.values(data[project.id] || {}).length;
    });
    return total;
  }, [selectedProjects, data]);

  const hasPeriodBars = periodBars.length > 0;
  const periodPad = 4, periodGap = 2;
  const periodIsMulti = periodLaneCount > 1;
  const periodBarHeight = periodIsMulti
    ? Math.floor((40 - periodPad * 2 - periodGap * (periodLaneCount - 1)) / periodLaneCount)
    : undefined;

  return (
    <>
      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.dateNav}>
            <button className={styles.navBtn} onClick={prevWeek}>
              <i className="ti ti-chevron-left"></i>
            </button>
            <span className={styles.dateLabel}>{dateLabel}</span>
            <button className={styles.navBtn} onClick={nextWeek}>
              <i className="ti ti-chevron-right"></i>
            </button>
            <button className={styles.todayBtn} onClick={goToToday}>
              <i className={`ti ti-target ${styles.todayIcon}`}></i>
              回到今天
            </button>
          </div>

          <div className={styles.toolbarRight}>
            <button className={styles.modeToggle} onClick={onToggleMode}>
              <i className={`ti ti-calendar-week ${styles.modeToggleIcon}`}></i>
              行事曆模式
            </button>

            <button
              className={`${styles.modeToggle}${overlayMode ? ` ${styles.active}` : ''}`}
              onClick={() => setOverlayMode(value => !value)}>
              <span className={styles.modeIcon}>
                <span className={`${styles.layer} ${styles.a}`}></span>
                <span className={`${styles.layer} ${styles.b}`}></span>
              </span>
              疊圖模式
              <i className={`ti ti-arrows-shuffle ${styles.shuffleIcon}`}></i>
            </button>

            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={`${styles.swatch} ${styles.we}`}></span>週末
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.swatch} ${styles.tl}`}></span>今天
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.swatch} ${styles.ms}`}></span>0 工時
              </div>
            </div>
          </div>
        </div>

        <div className={styles.scroll} ref={scrollRef}>
          <div className={styles.grid} style={{ minWidth: LABEL_W + COL_W * VIEW_DAYS }}>

            <aside className={styles.taskCol}>
              {overlayMode ? (
                <>
                  <div className={styles.colHead}>任務 · 多專案疊加</div>
                  {hasPeriodBars && (
                    <div className={styles.periodLabel}>期間</div>
                  )}
                  {overlayRows.map(({ id, name, bars }) => (
                    <div key={id} className={styles.taskName}>
                      <span className={styles.pid}>{id}</span>
                      <span className={styles.name}>{name}</span>
                      <span className={styles.projDots}>
                        {bars.map(({ project, tone }) => (
                          <span key={project.id} className={`${styles.pd} ${styles[tone]}`}></span>
                        ))}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className={styles.colHead}>任務</div>
                  {hasPeriodBars && (
                    <div className={styles.periodLabel}>期間</div>
                  )}
                  {normalGroups.map(({ project, tasks, tone }) => (
                    <div key={project.id}>
                      <div className={`${styles.projBanner} ${styles[tone]}`}>
                        <span className={styles.bannerDot} style={{ background: `var(--t-${tone}-ink)` }}></span>
                        {project.name}
                        <i className={`ti ti-chevron-down ${styles.collapse}`}></i>
                      </div>
                      {tasks.map(task => (
                        <div key={task.id} className={styles.taskName}>
                          <span className={styles.pid}>{task.id}</span>
                          <span className={styles.name}>{task.n}</span>
                          <span className={styles.hrs}>{task.hours ? `${task.hours}h` : ''}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </aside>

            <div className={styles.track}>
              <div className={styles.dateHeader}>
                {monthLabels.map((monthLabel, index) => (
                  <span key={index} className={styles.monthBand} style={{ left: monthLabel.columnIndex * COL_W + 12 }}>
                    {monthLabel.label}
                  </span>
                ))}
                {gridDays.map((gridDay, index) => {
                  const isToday = todayVisible && index === todayOffset;
                  return (
                    <div key={index}
                      className={`${styles.dateCell}${gridDay.isWeekend ? ` ${styles.weekend}` : gridDay.isBlackout ? ` ${styles.blackout}` : ''}${isToday ? ` ${styles.today}` : ''}`}
                      style={{ width: COL_W }}>
                      {isToday && <span className={styles.todayBubble}>今天</span>}
                      <span className={styles.dayNum}>{gridDay.date.getDate()}</span>
                      <span className={styles.dayName}>{DAY_NAMES[gridDay.dayOfWeek]}</span>
                    </div>
                  );
                })}
              </div>

              {hasPeriodBars && (
                <div className={styles.periodBand}>
                  {gridDays.map((gridDay, index) => (
                    <div key={index} className={`${styles.gridCell}${gridDay.isWeekend ? ` ${styles.weekend}` : gridDay.isBlackout ? ` ${styles.blackout}` : ''}`} style={{ width: COL_W }} />
                  ))}
                  {periodBars.map((bar, barIndex) =>
                    barSegments(bar.start, bar.end, viewStart, true).map((segment, segmentIndex) => (
                      <div key={`${barIndex}-${segmentIndex}`}
                        className={`${styles.bar} ${styles[bar.tone]}`}
                        style={{
                          left: segment.columnStart * COL_W, width: segment.span * COL_W,
                          ...(periodIsMulti ? { top: periodPad + bar.lane * (periodBarHeight + periodGap), height: periodBarHeight, bottom: 'auto' } : {}),
                        }}
                        onMouseEnter={(e) => handlePeriodBarEnter(e, bar)}
                        onMouseLeave={handleBarLeave}
                      />
                    ))
                  )}
                </div>
              )}

              <div className={`${styles.trackBody}${overlayMode ? ` ${styles.overlay}` : ''}`}>

                {todayVisible && (
                  <div className={styles.todayLine}
                    style={{ left: todayOffset * COL_W + COL_W / 2 }} />
                )}

                {milestones.map((milestone, index) => (
                  <div key={index} className={`${styles.milestone} ${styles[milestone.tone]}`}
                    style={{ left: milestone.offset * COL_W + COL_W / 2 }}
                    title={`${milestone.projectName}: ${milestone.label}`}>
                    <span className={styles.milestoneLabel}>
                      {milestone.projectName}<br />{milestone.label}
                    </span>
                  </div>
                ))}

                {overlayMode ? (
                  overlayRows.map(({ id, bars }) => {
                    const hasTimeOverlap = bars.length >= 2 && bars.some((a, indexA) =>
                      bars.some((b, indexB) => {
                        if (indexB <= indexA) return false;
                        return new Date(a.task.start) <= new Date(b.task.end) &&
                               new Date(b.task.start) <= new Date(a.task.end);
                      })
                    );
                    const isMulti = hasTimeOverlap;
                    const barCount = bars.length;
                    const PAD = 4, GAP = 2;
                    const barHeight = isMulti ? Math.floor((40 - PAD * 2 - GAP * (barCount - 1)) / barCount) : undefined;
                    return (
                      <div key={id} className={styles.taskRow}>
                        {gridDays.map((gridDay, index) => (
                          <div key={index} className={`${styles.gridCell}${gridDay.isWeekend ? ` ${styles.weekend}` : gridDay.isBlackout ? ` ${styles.blackout}` : ''}`}
                            style={{ width: COL_W }} />
                        ))}
                        {bars.map(({ project, task, tone }, barIndex) => {
                          const barTop = isMulti ? PAD + barIndex * (barHeight + GAP) : undefined;
                          return (
                            <div key={project.id}>
                              {barSegments(task.start, task.end, viewStart, WEEKEND_BAR_TASKS.has(task.id)).map((segment, segmentIndex) => (
                                <div key={`${project.id}-${segmentIndex}`}
                                  className={`${styles.bar} ${styles[tone]}${task.hours === 0 ? ` ${styles.placeholder}` : ''}${isMulti ? ` ${styles.split}` : ''}`}
                                  style={{
                                    left: segment.columnStart * COL_W + 2,
                                    width: segment.span * COL_W - 4,
                                    ...(isMulti ? { top: barTop, height: barHeight, bottom: 'auto' } : {}),
                                  }}
                                  onMouseEnter={(e) => handleBarEnter(e, task, project)}
                                  onMouseLeave={handleBarLeave}
                                  onDoubleClick={(e) => handleBarDblClick(e, task, project)}>
                                  {!isMulti && <span className={styles.barDot}></span>}
                                  {!isMulti && <span className={styles.barName}>{segmentIndex === 0 ? task.n : '續'}</span>}
                                </div>
                              ))}
                              {!isMulti && task.waitEnd && barSegments(addD(task.end, 1), task.waitEnd, viewStart).map((segment, segmentIndex) => (
                                <div key={`w${project.id}-${segmentIndex}`}
                                  className={styles.barWait}
                                  style={{ left: segment.columnStart * COL_W + 2, width: segment.span * COL_W - 4 }} />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                ) : (
                  normalGroups.map(({ project, tasks, tone }) => (
                    <div key={project.id}>
                      <div className={`${styles.projRow} ${styles[tone]}`}>
                        {gridDays.map((gridDay, index) => (
                          <div key={index} className={`${styles.gridCell}${gridDay.isWeekend ? ` ${styles.weekend} ${styles.dim}` : gridDay.isBlackout ? ` ${styles.blackout} ${styles.dim}` : ''}`}
                            style={{ width: COL_W }} />
                        ))}
                      </div>
                      {tasks.map(task => {
                        const projectTask = (project.tasks || []).find(candidate => candidate.id === task.id);
                        const isPinned = !!projectTask?.pinnedStart;
                        const parsedPinDate = isPinned ? pD(projectTask.pinnedStart) : null;
                        const pinOverridden = isPinned && parsedPinDate && new Date(task.start) > parsedPinDate;
                        return (
                          <div key={task.id} className={styles.taskRow}>
                            {gridDays.map((gridDay, index) => (
                              <div key={index} className={`${styles.gridCell}${gridDay.isWeekend ? ` ${styles.weekend}` : gridDay.isBlackout ? ` ${styles.blackout}` : ''}`}
                                style={{ width: COL_W }} />
                            ))}
                            {barSegments(task.start, task.end, viewStart, WEEKEND_BAR_TASKS.has(task.id)).map((segment, segmentIndex) => (
                              <div key={segmentIndex}
                                className={`${styles.bar} ${styles[tone]}${task.hours === 0 ? ` ${styles.placeholder}` : ''}${isPinned ? ` ${styles.pinned}` : ''}`}
                                style={{ left: segment.columnStart * COL_W + 2, width: segment.span * COL_W - 4 }}
                                onMouseEnter={(e) => handleBarEnter(e, task, project)}
                                onMouseLeave={handleBarLeave}
                                onDoubleClick={(e) => handleBarDblClick(e, task, project)}>
                                <span className={styles.barName}>{segmentIndex === 0 ? task.n : '續'}</span>
                                {segmentIndex === 0 && task.hours > 0 && (
                                  <span className={styles.barHrs}>{task.hours}h</span>
                                )}
                                {segmentIndex === 0 && isPinned && (
                                  <i className={`ti ti-pin ${styles.pinIcon}${pinOverridden ? ` ${styles.warn}` : ''}`}></i>
                                )}
                              </div>
                            ))}
                            {task.waitEnd && barSegments(addD(task.end, 1), task.waitEnd, viewStart).map((segment, segmentIndex) => (
                              <div key={`w${segmentIndex}`}
                                className={styles.barWait}
                                style={{ left: segment.columnStart * COL_W + 2, width: segment.span * COL_W - 4 }}>
                                {segmentIndex === 0 && <span className={styles.barWaitLabel}>等待</span>}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}

                {catPlacements.map(cat => (
                  <RandomCat key={cat.key} size={cat.size} className={styles.cat}
                    style={{ left: cat.left, top: cat.top }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span>
              <i className={`ti ti-info-circle ${styles.infoIcon}`}></i>
              共 {totalTasks} 個任務
            </span>
          </div>
          <div>
            <kbd>←</kbd> <kbd>→</kbd> 切換週 <kbd>T</kbd> 回今天
          </div>
        </div>
      </div>

      {tip && !pinState && (
        <div className={styles.tooltip} style={{ left: tip.x, top: tip.y }}>
          {tip.periodBar ? (
            <>
              <strong>{tip.periodBar.label}</strong>
              <span>{tip.periodBar.project.name}</span>
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
          onSave={updateTaskPin}
          onClose={() => setPinState(null)}
        />
      )}
    </>
  );
}
