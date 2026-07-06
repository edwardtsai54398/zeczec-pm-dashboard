import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { dBt, addD, fmt, pD } from '../../../../lib/dateUtils.js';
import { PH } from '../../../../lib/tasks.js';
import { useWorkspace } from '../../../../context/WorkspaceContext.jsx';
import { useAuthContext } from '../../../../context/AuthContext.jsx';
import { useWorkspaceMembers } from '../../../../hooks/useWorkspaceMembers.js';
import { usePermissions } from '../../../../hooks/usePermissions.js';
import TaskEditModal from '../TaskEditModal/index.jsx';
import { toneKey, buildPeriodBars, assignLanes, orderedPhaseKeys } from '../utils.js';
import styles from './GanttView.module.css';

const WEEKEND_BAR_TASKS = new Set(['7.3', '7.5', '7.7', '7.8', '7.10', '8.2', '8.4', '8.6', '8.8', '8.10']);

const LABEL_W = 240;
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// 每日欄寬(px)與最少顯示天數。COL_W 是所有水平計算的唯一來源(segment、今天線、里程碑、月份標、
// scroll 取整都由它算),改這一個常數即可放大整張圖。
const COL_W = 100;
const MIN_VIEW_DAYS = 21;

// 成員列版面:同格重疊的任務往下疊 lane,不設條數上限——列高改由該列的 lane 數撐開。
// 每條 lane 高 LANE_H、彼此間距 LANE_GAP、上下各留 LANE_PAD;空列或單一 lane 至少 MIN_ROW_H。
const LANE_H = 22;
const LANE_GAP = 4;
const LANE_PAD = 4;
const MIN_ROW_H = 30;

// 依 lane 數算某成員列的總高——左欄成員名與右軌甘特列都用它,兩邊同一 row 才能對齊。
function rowHeight(laneCount) {
  if (laneCount <= 0) return MIN_ROW_H;
  return Math.max(MIN_ROW_H, LANE_PAD * 2 + laneCount * LANE_H + (laneCount - 1) * LANE_GAP);
}

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

// 一個相位內的任務依「指派對象」分桶成列:工作區每位成員一列(即使沒任務也出空列,以維持左右對齊),
// owner 尚未載入時才在末尾補一「未指派」列。每列跑 assignLanes 得每個任務的 lane 與該列 laneCount。
// bucket 規則:assignee 是「非 owner 的現有成員」→ 歸該成員;其餘(未指派 / 指派給 owner /
// 指到已離開的成員)一律歸 owner——「未指派讀作 owner」,與 ProjectPage 下拉預設、排程容量算法一致。
// (owner 存檔時不寫 assignee,故預設任務根本沒有 assignee 欄位;這裡把它們收進 owner 列而非另立未指派列。)
function buildPhaseRows(records, members, ownerId, memberIdSet) {
  const byBucket = new Map();
  let hasUnassigned = false;
  for (const entry of records) {
    const rawAssignee = (entry.project.tasks || []).find(task => task.id === entry.record.id)?.assignee;
    // 非 owner 的現有成員 → 該成員;其餘一律歸 owner。owner 尚未載入(null)時才暫掛未指派列。
    const bucket = rawAssignee && rawAssignee !== ownerId && memberIdSet.has(rawAssignee) ? rawAssignee : (ownerId ?? null);
    if (bucket === null) hasUnassigned = true;
    const item = { ...entry, start: entry.record.start, end: entry.record.end };
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push(item);
  }
  const rows = members.map(member => {
    const items = byBucket.get(member.user_id) || [];
    const laneCount = assignLanes(items);
    return { memberId: member.user_id, memberName: member.display_name || member.email, items, laneCount };
  });
  if (hasUnassigned) {
    const items = byBucket.get(null) || [];
    const laneCount = assignLanes(items);
    rows.push({ memberId: null, memberName: '未指派', items, laneCount });
  }
  return rows;
}

// 一批 records(每筆含 { record, project, tone })依 record.p 分相位,回傳依 PHASE_ORDER 排好的
// [{ phaseKey, phaseMeta, rows }]。相位表 PH 沒有的鍵給灰底 fallback(比照 ProjectPage)。
function groupByPhase(records, members, ownerId, memberIdSet) {
  const byPhase = new Map();
  for (const entry of records) {
    const phaseKey = entry.record.p;
    if (!byPhase.has(phaseKey)) byPhase.set(phaseKey, []);
    byPhase.get(phaseKey).push(entry);
  }
  return orderedPhaseKeys([...byPhase.keys()]).map(phaseKey => ({
    phaseKey,
    phaseMeta: PH[phaseKey] || { n: phaseKey, c: '#888', tone: 'lavender' },
    rows: buildPhaseRows(byPhase.get(phaseKey), members, ownerId, memberIdSet),
  }));
}

export default function GanttView({ selectedProjects, onToggleMode }) {
  // 資料層直接從 context 取(比照 Dashboard / KOLPage);篩選 state 由 Gantt 容器持有。
  const { projects, sch: data, applyTaskDateChange } = useWorkspace();
  const { can } = usePermissions();
  const canEdit = can('editGantt'); // viewer 不能訂選任務日期(double click 無效)

  // 成員清單在「用到的這層」自取(比照 Dashboard),不從上層 props 串下來。
  const { workspaceId } = useAuthContext();
  const { members } = useWorkspaceMembers(workspaceId);
  const ownerId = useMemo(() => members.find(member => member.role === 'owner')?.user_id ?? null, [members]);
  const memberIdSet = useMemo(() => new Set(members.map(member => member.user_id)), [members]);

  const today = useMemo(() => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }, []);

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
    const cells = [];
    for (let i = 0; i < VIEW_DAYS; i++) {
      const date = addD(viewStart, i);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      cells.push({ date, isWeekend, dayOfWeek });
    }
    return cells;
  }, [viewStart, VIEW_DAYS]);

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

  // 一般模式:每個已選專案一區 → 區內依相位 → 每相位展開成員列。
  const phaseGroupsNormal = useMemo(() => {
    return selectedProjects.map(project => {
      const tone = toneKey(project);
      const records = Object.values(data[project.id] || {})
        .filter(record => record.start && record.end)
        .map(record => ({ record, project, tone }));
      const phases = groupByPhase(records, members, ownerId, memberIdSet);
      return { project, tone, phases };
    }).filter(group => group.phases.length > 0);
  }, [selectedProjects, data, members, ownerId, memberIdSet]);

  // 疊圖模式:拿掉專案分區,把所有已選專案的任務攤平後,只依相位 → 成員分組(任務塊仍以專案色調區分)。
  const phaseGroupsOverlay = useMemo(() => {
    const records = [];
    for (const project of selectedProjects) {
      const tone = toneKey(project);
      for (const record of Object.values(data[project.id] || {})) {
        if (!record.start || !record.end) continue;
        records.push({ record, project, tone });
      }
    }
    return { phases: groupByPhase(records, members, ownerId, memberIdSet) };
  }, [selectedProjects, data, members, ownerId, memberIdSet]);

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

  // 背景日格(每格寬 COL_W);相位/成員的每一列軌道都鋪一份,讓欄位對齊日期軸。
  const renderGridCells = () =>
    gridDays.map((gridDay, index) => (
      <div key={index}
        className={`${styles.gridCell}${gridDay.isWeekend ? ` ${styles.weekend}` : ''}`}
        style={{ width: COL_W }} />
    ));

  // 左欄:一列成員名稱(頭像首字 + 名稱 + 任務數);未指派列灰化。
  // 列高跟著右軌甘特列一起由 lane 數撐開(rowHeight),兩邊同一 row 才對得齊。
  const renderMemberName = (row) => (
    <div key={row.memberId ?? '__unassigned'}
      className={`${styles.memberName}${row.memberId === null ? ` ${styles.unassigned}` : ''}`}
      style={{ height: rowHeight(row.laneCount) }}>
      <span className={styles.memberAvatar}>{(row.memberName || '?').slice(0, 1)}</span>
      <span className={styles.name}>{row.memberName}</span>
      {row.items.length > 0 && <span className={styles.memberCount}>{row.items.length}</span>}
    </div>
  );

  // 右軌:一位成員在某相位的一列。列高由 lane 數撐開(rowHeight);任務塊依起訖日 × COL_W 定位,
  // 同格重疊者依序往下疊 lane(top = LANE_PAD + lane × 單位高),全部顯示、不再收成「+N」。
  const renderMemberRow = (row) => (
    <div key={row.memberId ?? '__unassigned'}
      className={`${styles.memberRow}${row.memberId === null ? ` ${styles.unassigned}` : ''}`}
      style={{ height: rowHeight(row.laneCount) }}>
      {renderGridCells()}
      {row.items.map((item) => {
        const { record, project, tone } = item;
        const top = LANE_PAD + item.lane * (LANE_H + LANE_GAP);
        const projectTask = (project.tasks || []).find(candidate => candidate.id === record.id);
        const isPinned = !!projectTask?.pinnedStart;
        const parsedPinDate = isPinned ? pD(projectTask.pinnedStart) : null;
        const pinOverridden = isPinned && parsedPinDate && new Date(record.start) > parsedPinDate;
        return (
          <div key={`${project.id}-${record.id}`}>
            {barSegments(record.start, record.end, viewStart, WEEKEND_BAR_TASKS.has(record.id)).map((segment, segmentIndex) => (
              <div key={segmentIndex}
                className={`${styles.bar} ${styles[tone]}${record.hours === 0 ? ` ${styles.placeholder}` : ''}${isPinned ? ` ${styles.pinned}` : ''}`}
                style={{ left: segment.columnStart * COL_W + 2, width: segment.span * COL_W - 4, top, height: LANE_H, bottom: 'auto' }}
                onMouseEnter={(e) => handleBarEnter(e, record, project)}
                onMouseLeave={handleBarLeave}
                onDoubleClick={(e) => handleBarDblClick(e, record, project)}>
                <span className={styles.barName}>{segmentIndex === 0 ? record.n : '續'}</span>
                {segmentIndex === 0 && record.hours > 0 && (
                  <span className={styles.barHrs}>{record.hours}h</span>
                )}
                {segmentIndex === 0 && isPinned && (
                  <i className={`ti ti-pin ${styles.pinIcon}${pinOverridden ? ` ${styles.warn}` : ''}`}></i>
                )}
              </div>
            ))}
            {record.waitEnd && barSegments(addD(record.end, 1), record.waitEnd, viewStart).map((segment, segmentIndex) => (
              <div key={`w${segmentIndex}`}
                className={styles.barWait}
                style={{ left: segment.columnStart * COL_W + 2, width: segment.span * COL_W - 4, top, height: LANE_H, bottom: 'auto' }} />
            ))}
          </div>
        );
      })}
    </div>
  );

  // 左欄一個相位群組:相位名做「跨列合併」的直向格(佔滿該相位所有成員列高),右邊接一疊成員名。
  const renderPhaseLeft = ({ phaseKey, phaseMeta, rows }) => (
    <div key={phaseKey} className={styles.phaseGroup}>
      <div className={styles.phaseLabel} style={{ '--phase-c': phaseMeta.c }}>
        <span className={styles.phaseDot} style={{ background: phaseMeta.c }}></span>
        <span className={styles.phaseText}>{phaseMeta.n}</span>
      </div>
      <div className={styles.phaseMembers}>
        {rows.map(renderMemberName)}
      </div>
    </div>
  );

  // 右軌一個相位群組:只疊該相位的成員甘特列(相位名在左欄的合併格,這裡不再放間隔列)。
  const renderPhaseTrack = ({ phaseKey, rows }) => (
    <div key={phaseKey} className={styles.phaseTrack}>
      {rows.map(renderMemberRow)}
    </div>
  );

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
              <div className={styles.colHead}>{overlayMode ? '成員負載 · 多專案疊加' : '成員負載'}</div>
              {hasPeriodBars && (
                <div className={styles.periodLabel}>期間</div>
              )}
              {overlayMode ? (
                phaseGroupsOverlay.phases.map(renderPhaseLeft)
              ) : (
                phaseGroupsNormal.map(({ project, tone, phases }) => (
                  <div key={project.id}>
                    <div className={`${styles.projBanner} ${styles[tone]}`}>
                      <span className={styles.bannerDot} style={{ background: `var(--t-${tone}-ink)` }}></span>
                      {project.name}
                    </div>
                    {phases.map(renderPhaseLeft)}
                  </div>
                ))
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
                      className={`${styles.dateCell}${gridDay.isWeekend ? ` ${styles.weekend}` : ''}${isToday ? ` ${styles.today}` : ''}`}
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
                    <div key={index} className={`${styles.gridCell}${gridDay.isWeekend ? ` ${styles.weekend}` : ''}`} style={{ width: COL_W }} />
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
                  phaseGroupsOverlay.phases.map(renderPhaseTrack)
                ) : (
                  phaseGroupsNormal.map(({ project, tone, phases }) => (
                    <div key={project.id}>
                      <div className={`${styles.projRow} ${styles[tone]}`}>
                        {renderGridCells()}
                      </div>
                      {phases.map(renderPhaseTrack)}
                    </div>
                  ))
                )}
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
          onSave={applyTaskDateChange}
          onClose={() => setPinState(null)}
        />
      )}
    </>
  );
}
