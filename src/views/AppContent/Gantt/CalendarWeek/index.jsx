import { useState, useMemo, useCallback } from 'react';
import { addD, dBt, fmt, fmtF, pD } from '../../../../lib/dateUtils.js';
import { WEEK } from '../../shared.js';
import { useWorkspace } from '../../../../context/WorkspaceContext.jsx';
import { usePermissions } from '../../../../hooks/usePermissions.js';
import TaskEditModal from '../TaskEditModal/index.jsx';
import { toneKey, buildPeriodBars, sunday } from '../utils.js';
import styles from './CalendarWeek.module.css';

// 每小時列高(px)。列數 = 工作區設定的每日工時;不顯示時刻文字,
// 因為不知道使用者幾點開始上班,只呈現「當天第 1~N 小時」的相對順序。
const HOUR_H = 70;

export default function CalendarWeek({ selectedProjects, onToggleMode }) {
  // 資料層直接從 context 取(比照 GanttView);篩選 state 由 Gantt 容器持有。
  const { projects, sch: data, settings, applyTaskDateChange } = useWorkspace();
  const { can } = usePermissions();
  const canEdit = can('editGantt'); // viewer 不能訂選任務日期(double click 無效)

  const hoursPerDay = settings?.hoursPerDay || 8;

  const today = useMemo(() => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }, []);

  // 換週是改 state 重算整週,不像甘特圖用捲動;一週固定從週日開始。
  const [weekStart, setWeekStart] = useState(() => sunday(new Date()));
  const [tip, setTip] = useState(null);
  const [pinState, setPinState] = useState(null);

  const prevWeek = () => setWeekStart(addD(weekStart, -7));
  const nextWeek = () => setWeekStart(addD(weekStart, 7));
  const goToToday = () => setWeekStart(sunday(today));

  const weekDays = useMemo(() => {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const date = addD(weekStart, i);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      cells.push({
        date,
        key: fmtF(date),
        dayOfWeek,
        isWeekend,
        isToday: +date === +today,
      });
    }
    return cells;
  }, [weekStart, today]);

  // 依排程器的每日分配明細(task.days)把任務攤進各天:
  // 有工時的任務照 { h, o } 畫成區塊;0 工時任務(發文類)進頂部全天列。
  const { dayBlocks, allDayChips } = useMemo(() => {
    const blocks = {};
    const chips = {};
    weekDays.forEach(day => { blocks[day.key] = []; chips[day.key] = []; });

    selectedProjects.forEach(project => {
      const tone = toneKey(project);
      Object.values(data[project.id] || {}).forEach(task => {
        if (!task.start || !task.end) return;
        if (task.hours === 0) {
          const startKey = fmtF(new Date(task.start));
          if (chips[startKey]) chips[startKey].push({ task, project, tone });
          return;
        }
        Object.entries(task.days || {}).forEach(([dateKey, { h, o }]) => {
          if (blocks[dateKey]) blocks[dateKey].push({ task, project, tone, hours: h, offset: o });
        });
      });
    });

    // 依 offset 排序讓 DOM 順序 = 視覺順序(排程器的優先順序)
    weekDays.forEach(day => blocks[day.key].sort((a, b) => a.offset - b.offset));
    return { dayBlocks: blocks, allDayChips: chips };
  }, [selectedProjects, data, weekDays]);

  const milestones = useMemo(() => {
    const result = [];
    selectedProjects.forEach(project => {
      const tone = toneKey(project);
      const add = (dateString, label) => {
        const parsedDate = pD(dateString);
        if (!parsedDate) return;
        const offset = dBt(weekStart, parsedDate);
        if (offset >= 0 && offset < 7) result.push({ offset, label, tone, projectName: project.name });
      };
      add(project.surveyStart, '問卷開始');
      add(project.campaignStart, '上線日');
      add(project.campaignEnd, '結束日');
    });
    return result;
  }, [selectedProjects, weekStart]);

  const { periodLaneCount, weekPeriodBars } = useMemo(() => {
    const { periodBars, periodLaneCount: laneCount } = buildPeriodBars(selectedProjects);
    // 期間帶裁切到本週範圍,完全落在週外的不畫
    const clipped = [];
    for (const bar of periodBars) {
      const rawStart = dBt(weekStart, pD(bar.start));
      const rawEnd = dBt(weekStart, pD(bar.end));
      if (rawEnd < 0 || rawStart > 6) continue;
      clipped.push({ bar, startOffset: Math.max(0, rawStart), endOffset: Math.min(6, rawEnd) });
    }
    return { periodLaneCount: laneCount, weekPeriodBars: clipped };
  }, [selectedProjects, weekStart]);

  const totalTasks = useMemo(() => {
    let total = 0;
    selectedProjects.forEach(project => {
      total += Object.values(data[project.id] || {}).length;
    });
    return total;
  }, [selectedProjects, data]);

  const handleBlockEnter = useCallback((event, task, project, dayHours) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      task,
      project,
      dayHours,
    });
  }, []);
  const handleLeave = useCallback(() => setTip(null), []);

  const handlePeriodEnter = useCallback((event, bar) => {
    setTip({ x: event.clientX, y: event.clientY, periodBar: bar });
  }, []);

  const handleDblClick = useCallback((event, task, project) => {
    event.stopPropagation();
    if (!canEdit) return; // 唯讀:double click 不開啟訂選彈窗
    setTip(null);
    setPinState({ pid: project.id, taskId: task.id });
  }, [canEdit]);

  const weekEnd = addD(weekStart, 6);
  const dateLabel = weekStart.getFullYear() !== weekEnd.getFullYear()
    ? `${weekStart.getFullYear()} 年 ${weekStart.getMonth() + 1} 月 – ${weekEnd.getFullYear()} 年 ${weekEnd.getMonth() + 1} 月`
    : weekStart.getMonth() === weekEnd.getMonth()
      ? `${weekStart.getFullYear()} 年 ${weekStart.getMonth() + 1} 月`
      : `${weekStart.getFullYear()} 年 ${weekStart.getMonth() + 1} – ${weekEnd.getMonth() + 1} 月`;

  const hasChips = weekDays.some(day => allDayChips[day.key].length > 0);
  const hasPeriodBars = weekPeriodBars.length > 0;
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
              <i className={`ti ti-chart-gantt ${styles.modeToggleIcon}`}></i>
              甘特圖模式
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

        <div className={styles.headerRow}>
          <div className={styles.gutterCell} />
          <div className={styles.days}>
            {weekDays.map(day => (
              <div key={day.key}
                className={`${styles.dayHead}${day.isWeekend ? ` ${styles.weekend}` : ''}${day.isToday ? ` ${styles.today}` : ''}`}>
                <span className={styles.dayName}>週{WEEK[day.dayOfWeek]}</span>
                <span className={styles.dayNum}>{day.date.getDate()}</span>
              </div>
            ))}
          </div>
        </div>

        {hasChips && (
          <div className={styles.allDayRow}>
            <div className={styles.gutterCell} />
            <div className={styles.days}>
              {weekDays.map(day => (
                <div key={day.key}
                  className={`${styles.allDayCell}${day.isWeekend ? ` ${styles.weekend}` : ''}`}>
                  {allDayChips[day.key].map(({ task, project, tone }) => (
                    <div key={`${project.id}-${task.id}`}
                      className={`${styles.chip} ${styles[tone]}`}
                      onMouseEnter={(e) => handleBlockEnter(e, task, project, null)}
                      onMouseLeave={handleLeave}
                      onDoubleClick={(e) => handleDblClick(e, task, project)}>
                      {task.n}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasPeriodBars && (
          <div className={styles.periodRow}>
            <div className={styles.gutterCell} />
            <div className={styles.periodTrack}>
              {weekPeriodBars.map(({ bar, startOffset, endOffset }, index) => (
                <div key={index}
                  className={`${styles.periodBar} ${styles[bar.tone]}`}
                  style={{
                    left: `${(startOffset / 7) * 100}%`,
                    width: `${((endOffset - startOffset + 1) / 7) * 100}%`,
                    ...(periodIsMulti ? { top: periodPad + bar.lane * (periodBarHeight + periodGap), height: periodBarHeight, bottom: 'auto' } : {}),
                  }}
                  onMouseEnter={(e) => handlePeriodEnter(e, bar)}
                  onMouseLeave={handleLeave}
                />
              ))}
            </div>
          </div>
        )}

        <div className={styles.body}>
          <div className={styles.bodyGrid} style={{ height: hoursPerDay * HOUR_H }}>
            <div className={styles.gutter} />
            <div className={styles.daysArea}>
              {weekDays.map(day => (
                <div key={day.key}
                  className={`${styles.dayCol}${day.isWeekend ? ` ${styles.weekend}` : ''}${day.isToday ? ` ${styles.today}` : ''}`}>
                  {dayBlocks[day.key].map(({ task, project, tone, hours, offset }) => (
                    <div key={`${project.id}-${task.id}`}
                      className={`${styles.block} ${styles[tone]}`}
                      style={{ top: offset * HOUR_H + 1, height: Math.max(hours * HOUR_H - 2, 16) }}
                      onMouseEnter={(e) => handleBlockEnter(e, task, project, hours)}
                      onMouseLeave={handleLeave}
                      onDoubleClick={(e) => handleDblClick(e, task, project)}>
                      <span className={styles.blockName}>{task.n}</span>
                      <span className={styles.blockHrs}>{hours}h</span>
                    </div>
                  ))}
                </div>
              ))}
              {milestones.map((milestone, index) => (
                <div key={index} className={`${styles.milestone} ${styles[milestone.tone]}`}
                  style={{ left: `${((milestone.offset + 0.5) / 7) * 100}%` }}
                  title={`${milestone.projectName}: ${milestone.label}`}>
                  <span className={styles.milestoneLabel}>
                    {milestone.projectName}<br />{milestone.label}
                  </span>
                </div>
              ))}
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
            每格一小時 · 一日 {hoursPerDay} 小時工時
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
              {tip.dayHours != null && <span>本日 {tip.dayHours}h</span>}
              {tip.task.hours > 0 && <span>共 {tip.task.hours}h</span>}
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
