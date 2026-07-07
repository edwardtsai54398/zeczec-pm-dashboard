import { useState, useMemo, useCallback, useRef } from 'react';
import { addD, dBt, fmt, fmtF, pD } from '../../../../lib/dateUtils.js';
import { GRID_START_HOUR, GRID_END_HOUR, SCHEDULE_START_HOUR } from '../../../../constants.js';
import { WEEK } from '../../shared.js';
import { useWorkspace } from '../../../../context/WorkspaceContext.jsx';
import { useAuthContext } from '../../../../context/AuthContext.jsx';
import { useWorkspaceMembers } from '../../../../hooks/useWorkspaceMembers.js';
import { usePermissions } from '../../../../hooks/usePermissions.js';
import TaskEditModal from '../TaskEditModal/index.jsx';
import { useReflowPrompt } from '../useReflowPrompt.jsx';
import { useCalendarDrag } from './useCalendarDrag.js';
import {
  toneKey, buildPeriodBars, sunday,
  bucketFor, buildMemberColors, memberColorOf, layoutDayColumns, hourLabel,
} from '../utils.js';
import styles from './CalendarWeek.module.css';

// 時間軸寫死真實時鐘:上午 8 點到午夜(24 點),每小時一列(HOUR_H 像素)。
// 自動排程輸出的 offset(該成員當日已用工時數)以 SCHEDULE_START_HOUR 為第 0 小時的落點,
// 所以 o=0 的任務畫在 10:00、而 8~9 點是空的早晨。這是純顯示層位移,排程器不知道幾點上班。
// GRID_*/SCHEDULE_START_HOUR 從 constants 共用(拖拉換算、彈窗也用同一套),HOUR_H 為此視圖專屬像素。
const HOUR_H = 52;
const START_ROWS = SCHEDULE_START_HOUR - GRID_START_HOUR; // 排程起點在格線上的列位移
const ROWS = GRID_END_HOUR - GRID_START_HOUR;
const HOUR_ROWS = Array.from({ length: ROWS }, (_, i) => GRID_START_HOUR + i);

// 成員顯示偏好存本機(不上雲):依 workspace 分 key,重整後沿用。
const visibleMembersKey = (workspaceId) => `calendar_visible_members_${workspaceId}`;

// 讀某工作區的「顯示哪些成員」:localStorage 有就用,沒存過預設「只顯示自己」。
function readVisibleMembers(workspaceId, currentUserId) {
  try {
    const raw = localStorage.getItem(visibleMembersKey(workspaceId));
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* 隱私模式讀不到就走預設 */ }
  return new Set(currentUserId ? [currentUserId] : []);
}

export default function CalendarWeek({ selectedProjects, onToggleMode }) {
  // 資料層直接從 context 取(比照 GanttView);篩選 state 由 Gantt 容器持有。
  const { projects, sch: data } = useWorkspace();
  const { can } = usePermissions();
  const canEdit = can('editGantt'); // viewer 不能訂選/拖拉任務(double click、拖拉皆無效)

  // 「先套用再問」:拖拉/縮放/彈窗存檔都走 applyThenAsk(先寫只改這一個,再問要不要重排下游)。
  const { applyThenAsk, promptElement } = useReflowPrompt();
  const daysAreaRef = useRef(null); // 量欄寬,把水平拖拉像素換成「第幾天」
  const { drag, onPointerDown } = useCalendarDrag({ hourH: HOUR_H, daysAreaRef, canEdit, onCommit: applyThenAsk });

  // 成員相關狀態全在這層自持(不從容器 props 傳下來):清單、分桶、配色、顯示開關。
  const { workspaceId, session } = useAuthContext();
  const currentUserId = session?.user?.id ?? null;
  const { members } = useWorkspaceMembers(workspaceId);
  const ownerId = useMemo(() => members.find(member => member.role === 'owner')?.user_id ?? null, [members]);
  const memberIdSet = useMemo(() => new Set(members.map(member => member.user_id)), [members]);
  const memberColors = useMemo(() => buildMemberColors(members), [members]);

  // 顯示哪些成員的任務。初值由 localStorage 讀(沒存過預設只顯示自己);
  // 切換工作區時在 render 期間即時改讀新工作區的偏好(React 推薦作法,取代 setState-in-effect)。
  const [visibleMembers, setVisibleMembers] = useState(() => readVisibleMembers(workspaceId, currentUserId));
  const [trackedWorkspace, setTrackedWorkspace] = useState(workspaceId);
  if (workspaceId !== trackedWorkspace) {
    setTrackedWorkspace(workspaceId);
    setVisibleMembers(readVisibleMembers(workspaceId, currentUserId));
  }

  const toggleMember = useCallback((memberId) => {
    setVisibleMembers(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      try { localStorage.setItem(visibleMembersKey(workspaceId), JSON.stringify([...next])); } catch { /* 隱私模式忽略 */ }
      return next;
    });
  }, [workspaceId]);

  const memberNameOf = useCallback((memberId) => {
    if (memberId == null) return '未指派';
    const member = members.find(m => m.user_id === memberId);
    return member ? (member.display_name || member.email) : '未指派';
  }, [members]);

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

  // 成員清單尚未載入(RPC pending)時不套用過濾,避免整週閃空白;載入後才依 visibleMembers 篩。
  const filterActive = members.length > 0;
  const isVisible = useCallback(
    (memberId) => !filterActive || visibleMembers.has(memberId),
    [filterActive, visibleMembers],
  );

  // 依排程器的每日分配明細(task.days)把任務攤進各天:有工時的畫成區塊、0 工時進頂部全天列。
  // 每個任務先用 bucketFor 算負責成員,依 visibleMembers 過濾;同一天內重疊的區塊再跑
  // layoutDayColumns 得 { col, cols } 做左右錯開。
  const { dayBlocks, allDayChips } = useMemo(() => {
    const blocks = {};
    const chips = {};
    weekDays.forEach(day => { blocks[day.key] = []; chips[day.key] = []; });

    selectedProjects.forEach(project => {
      const tone = toneKey(project);
      Object.values(data[project.id] || {}).forEach(task => {
        if (!task.start || !task.end) return;
        const memberId = bucketFor(task.assignee, ownerId, memberIdSet);
        if (!isVisible(memberId)) return;
        const memberColor = memberColorOf(memberColors, memberId);
        if (task.hours === 0) {
          const startKey = fmtF(new Date(task.start));
          if (chips[startKey]) chips[startKey].push({ task, project, tone, memberId, memberColor });
          return;
        }
        Object.entries(task.days || {}).forEach(([dateKey, { h, o }]) => {
          if (blocks[dateKey]) blocks[dateKey].push({ task, project, tone, memberId, memberColor, hours: h, offset: o });
        });
      });
    });

    // 依 offset 排序讓 DOM 順序 = 視覺順序,再算重疊欄位。
    // 忠實照落地排程的 o 定位——不在渲染層重排(手動排程優先);時間重疊就分欄錯開。
    weekDays.forEach(day => {
      const list = blocks[day.key];
      list.sort((a, b) => a.offset - b.offset);
      const layout = layoutDayColumns(list);
      list.forEach(block => {
        const { col, cols } = layout.get(block) || { col: 0, cols: 1 };
        block.col = col;
        block.cols = cols;
      });
    });
    return { dayBlocks: blocks, allDayChips: chips };
  }, [selectedProjects, data, weekDays, ownerId, memberIdSet, memberColors, isVisible]);

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

  const handleBlockEnter = useCallback((event, task, project, dayHours, assigneeName) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      task,
      project,
      dayHours,
      assigneeName,
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

        {members.length > 0 && (
          <div className={styles.memberFilter}>
            <span className={styles.memberFilterLabel}>成員</span>
            {members.map(member => {
              const color = memberColorOf(memberColors, member.user_id);
              const checked = !!visibleMembers?.has(member.user_id);
              return (
                <button key={member.user_id}
                  className={`${styles.memberChip}${checked ? ` ${styles.memberChecked}` : ''}`}
                  style={checked ? { borderColor: color } : undefined}
                  onClick={() => toggleMember(member.user_id)}>
                  <span className={styles.memberCheckbox}
                    style={checked ? { background: color, borderColor: color } : undefined}>
                    {checked && <i className={`ti ti-check ${styles.memberCheckIcon}`}></i>}
                  </span>
                  <span className={styles.memberDot} style={{ background: color, opacity: checked ? 1 : 0.4 }}></span>
                  {member.display_name || member.email}
                </button>
              );
            })}
          </div>
        )}

        {/* 表頭三列與小時格線同放一個垂直捲動容器(比照甘特視圖):捲軸一併縮減內寬,
            7 欄的欄線在表頭與格線之間永遠對齊。表頭整組 sticky 固定在頂,格線在其下捲過。 */}
        <div className={styles.scrollArea}>
          <div className={styles.stickyHead}>
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
                      {allDayChips[day.key].map(({ task, project, tone, memberId, memberColor }) => (
                        <div key={`${project.id}-${task.id}`}
                          className={`${styles.chip} ${styles[tone]}`}
                          style={{ borderLeft: `3px solid ${memberColor}` }}
                          onMouseEnter={(e) => handleBlockEnter(e, task, project, null, memberId != null ? memberNameOf(memberId) : null)}
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
          </div>

          <div className={styles.bodyGrid} style={{ height: ROWS * HOUR_H, '--hour-h': `${HOUR_H}px` }}>
            <div className={styles.gutter}>
              {HOUR_ROWS.map(hour => (
                <div key={hour} className={styles.hourLabel} style={{ top: (hour - GRID_START_HOUR) * HOUR_H }}>
                  {hourLabel(hour)}
                </div>
              ))}
            </div>
            <div className={styles.daysArea} ref={daysAreaRef}>
              {weekDays.map(day => (
                <div key={day.key}
                  className={`${styles.dayCol}${day.isWeekend ? ` ${styles.weekend}` : ''}${day.isToday ? ` ${styles.today}` : ''}`}>
                  {dayBlocks[day.key].map(({ task, project, tone, memberId, memberColor, hours, offset, col, cols }) => {
                    const blockKey = `${project.id}-${task.id}`;
                    const isDragging = drag?.key === blockKey;
                    const baseHeight = Math.max(hours * HOUR_H - 2, 16);
                    // 拖拉中即時預覽:移動用 translate 跟著游標、縮放即時加高;放手才真的寫入 DB。
                    const dragStyle = !isDragging ? null
                      : drag.mode === 'move'
                        ? { transform: `translate(${drag.dx}px, ${drag.dy}px)`, opacity: 0.85, zIndex: 20, transition: 'none' }
                        : { height: Math.max(baseHeight + drag.dy, 16), zIndex: 20, transition: 'none' };
                    return (
                      <div key={blockKey}
                        className={`${styles.block} ${styles[tone]}${canEdit ? ` ${styles.editable}` : ''}`}
                        style={{
                          top: (START_ROWS + offset) * HOUR_H + 1,
                          height: baseHeight,
                          left: `calc(${(col * 100) / cols}% + 3px)`,
                          width: `calc(${100 / cols}% - 6px)`,
                          right: 'auto',
                          ...dragStyle,
                        }}
                        onPointerDown={(e) => { setTip(null); onPointerDown(e, 'move', task, project); }}
                        onMouseEnter={(e) => handleBlockEnter(e, task, project, hours, memberId != null ? memberNameOf(memberId) : null)}
                        onMouseLeave={handleLeave}
                        onDoubleClick={(e) => handleDblClick(e, task, project)}>
                        <span className={styles.memberStripe} style={{ background: memberColor }} />
                        <span className={styles.blockName}>{task.n}</span>
                        <span className={styles.blockHrs}>{hours}h</span>
                        {canEdit && (
                          <span className={styles.resizeHandle}
                            onPointerDown={(e) => { setTip(null); onPointerDown(e, 'resize', task, project); }} />
                        )}
                      </div>
                    );
                  })}
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
            每格一小時 · 上午 8 點 – 午夜 · 自動排程 10 點起
          </div>
        </div>
      </div>

      {tip && !pinState && !drag && (
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
              {tip.assigneeName && <span>負責人:{tip.assigneeName}</span>}
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
          onSave={applyThenAsk}
          onClose={() => setPinState(null)}
        />
      )}

      {promptElement}
    </>
  );
}
