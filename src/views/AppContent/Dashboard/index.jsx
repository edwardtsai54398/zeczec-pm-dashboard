import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { dBt, pD } from '../../../lib/dateUtils.js';
import { WEEK, greetingFor } from '../shared.js';
import RandomCat from '../../../components/CatSvg/RandomCat.jsx';
import { useAuthContext } from '../../../context/AuthContext.jsx';
import { useWorkspace } from '../../../context/WorkspaceContext.jsx';
import { useCloudWorkspaceState } from '../../../hooks/useCloudWorkspaceState.js';
import MilestonesCard from './MilestonesCard/index.jsx';
import TimelineCard from './TimelineCard/index.jsx';
import TodoCard from './TodoCard/index.jsx';
import OverdueCard from './OverdueCard/index.jsx';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const { projects, sch: data, miles } = useWorkspace();
  const navigate = useNavigate();

  const today = useMemo(() => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }, []);
  const hour = new Date().getHours();

  // 完成狀態(打勾/過期關閉)的唯一資料源,直接從 context 取(比照 KOLPage / SettingsPage),
  // 再串給底下卡片。todo_done 由今日待辦與近七日活動共用,故必須集中一處避免互蓋。
  const { workspaceId, session } = useAuthContext();
  const { todoDone, overdueDone, toggleTodoDone, dismissOverdue } =
    useCloudWorkspaceState(workspaceId, session?.user?.id);

  const allTasks = useMemo(() => {
    const result = [];
    projects.forEach((project) => {
      Object.values(data[project.id] || {}).forEach((task) => result.push({ ...task, _proj: project }));
    });
    return result;
  }, [projects, data]);

  const kolTasks = useMemo(() => {
    const result = [];
    projects.forEach((project) => {
      (project.kols || []).forEach((kol) => {
        kol.milestones.forEach((milestone) => {
          if (!milestone.date) return;
          const date = pD(milestone.date);
          if (!date) return;
          result.push({
            id: `kol_${kol.id}_${milestone.id}`,
            n: `${milestone.name}-${kol.name}`,
            start: date,
            end: date,
            hours: 0,
            p: "4",
            _proj: project,
            _isKol: true,
          });
        });
      });
    });
    return result;
  }, [projects]);

  const todayTasks = [], soonTasks = [], overdueTasks = [];
  allTasks.forEach((task) => {
    const startDate = new Date(task.start), endDate = new Date(task.end);
    startDate.setHours(0, 0, 0, 0); endDate.setHours(0, 0, 0, 0);
    if (endDate < today) overdueTasks.push(task);
    else if (startDate <= today && endDate >= today) todayTasks.push(task);
    else if (startDate > today && dBt(today, startDate) <= 7) soonTasks.push(task);
  });
  kolTasks.forEach((task) => {
    const startDate = new Date(task.start), endDate = new Date(task.end);
    startDate.setHours(0, 0, 0, 0); endDate.setHours(0, 0, 0, 0);
    if (startDate <= today && endDate >= today) todayTasks.push(task);
    else if (startDate > today && dBt(today, startDate) <= 7) soonTasks.push(task);
  });
  todayTasks.sort((a, b) => new Date(a.end) - new Date(b.end));
  soonTasks.sort((a, b) => new Date(a.start) - new Date(b.start));

  const weekTasks = allTasks.filter((task) => {
    const startDate = new Date(task.start); startDate.setHours(0, 0, 0, 0);
    return dBt(today, startDate) >= -3 && dBt(today, startDate) <= 7 && (task.hours || 0) > 0;
  });
  const weekHours = weekTasks.reduce((sum, task) => sum + (task.hours || 0), 0);
  const activeProjects = projects.filter((project) => project.startDate || project.campaignStart).length;

  const timelineDays = 7;
  const timelineTasks = useMemo(() => {
    const items = [];
    [...allTasks, ...kolTasks].forEach((task) => {
      const startDate = new Date(task.start), endDate = new Date(task.end);
      startDate.setHours(0, 0, 0, 0); endDate.setHours(0, 0, 0, 0);
      const startOffset = dBt(today, startDate), endOffset = dBt(today, endDate);
      if (endOffset < 0 || startOffset > timelineDays - 1) return;
      items.push({ ...task, startIdx: Math.max(0, startOffset), endIdx: Math.min(timelineDays - 1, endOffset) });
    });
    return items.sort((a, b) => a.startIdx - b.startIdx);
  }, [allTasks, kolTasks, today]);

  return (
    <div>
      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <h1 className={styles.greeting}>
            {greetingFor(hour)}<em>,</em> <em>讓今天順利推進。</em>
          </h1>
          <p className={styles.greetingSub}>
            今天是 {today.getMonth() + 1}/{today.getDate()} 週{WEEK[today.getDay()]} · {todayTasks.length} 項任務進行中 · 接下來 7 天還有 {soonTasks.length} 項
          </p>
        </div>
        <RandomCat />
        <div className={styles.heroRight}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>進行中專案</div>
            <div className={styles.statValue}>{activeProjects}<i className="ti ti-arrow-up-right"></i></div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>本週工時</div>
            <div className={styles.statValue}>{Math.round(weekHours)}<span className={styles.unit}>hr</span><i className="ti ti-arrow-up-right"></i></div>
          </div>
        </div>
      </section>

      <div className={styles.dashCards}>
        <TodoCard tasks={todayTasks} today={today} done={todoDone} onToggle={toggleTodoDone} />
        {overdueTasks.length > 0 && (
          <OverdueCard tasks={overdueTasks} today={today} dismissed={overdueDone} onDismiss={dismissOverdue} />
        )}
        <TimelineCard tasks={timelineTasks} done={todoDone} onToggle={toggleTodoDone} />
        <MilestonesCard projects={projects} miles={miles} onJump={() => navigate('/gantt')} />
      </div>
    </div>
  );
}
