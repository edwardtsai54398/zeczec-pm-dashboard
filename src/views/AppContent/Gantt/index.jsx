import { useState } from 'react';
import { useWorkspace } from '../../../context/WorkspaceContext.jsx';
import { usePermissions } from '../../../hooks/usePermissions.js';
import { toneKey } from './utils.js';
import GanttView from './GanttView/index.jsx';
import CalendarWeek from './CalendarWeek/index.jsx';
import AddTaskModal from './AddTaskModal/index.jsx';
import styles from './Gantt.module.css';

export default function Gantt() {
  // 這層只持有兩個視圖共用的狀態(專案篩選、模式切換)與篩選列 UI;
  // 甘特圖 / 行事曆的資料與邏輯各自在 GanttView / CalendarWeek 內取用。
  const { projects, sch: data } = useWorkspace();
  const { can } = usePermissions();
  const canEdit = can('editGantt'); // viewer 不能新增任務

  const [calendarMode, setCalendarMode] = useState(true);
  const [selected, setSelected] = useState(() => new Set(projects.map(project => project.id)));
  const [showAdd, setShowAdd] = useState(false);

  const toggleProject = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  };

  const selectedProjects = projects.filter(project => selected.has(project.id));

  const hasData = projects.some(project => Object.keys(data[project.id] || {}).length > 0);
  if (!projects.length || !hasData) {
    return (
      <div className="empty">
        <i className="ti ti-timeline"></i>
        設定啟動日期後即可看到甘特圖
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.filterRow}>
        <span className={styles.filterLabel}>專案</span>
        {projects.map(project => {
          const tone = toneKey(project);
          const checked = selected.has(project.id);
          return (
            <div key={project.id}
              className={`${styles.chip}${checked ? ` ${styles.checked}` : ''} ${styles[tone]}`}
              onClick={() => toggleProject(project.id)}>
              <span className={styles.checkbox}>
                {checked && <i className={`ti ti-check ${styles.checkIcon}`}></i>}
              </span>
              <span className={styles.dot} style={{ background: `var(--t-${tone}-ink)` }}></span>
              {project.name}
            </div>
          );
        })}
        <span className={styles.filterCount}>· 顯示 {selected.size} / {projects.length} 個專案</span>
        <span className={styles.filterSpacer} />
        {canEdit && (
          <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
            <i className="ti ti-plus"></i>新增任務
          </button>
        )}
      </div>

      {calendarMode ? (
        <CalendarWeek
          selectedProjects={selectedProjects}
          onToggleMode={() => setCalendarMode(false)}
        />
      ) : (
        <GanttView
          selectedProjects={selectedProjects}
          onToggleMode={() => setCalendarMode(true)}
        />
      )}

      {showAdd && (
        <AddTaskModal
          defaultProjectId={selectedProjects[0]?.id}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
