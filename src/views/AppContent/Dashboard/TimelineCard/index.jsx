import { fmt } from '../../../../lib/dateUtils.js';
import { PH } from '../../../../lib/tasks.js';
import { getTone } from '../../shared.js';
import { taskKey, taskUntil } from '../utils.js';

// 近七日活動:未來七日內即將開始的任務(不含今日)。
// 沿用全域 .todo-* 清單樣式,本身沒有專屬樣式故不需 module.css。
export default function TimelineCard({ tasks, done, onToggle }) {
  const upcomingTasks = tasks.filter((task) => task.startIdx > 0);

  return (
    <div className="card">
      <div className="card-title">
        <span>近七日活動</span>
      </div>
      <p className="card-sub">未來 7 天即將開始的任務（不含今日）</p>
      <div className="todo-list">
        {upcomingTasks.length === 0 && (
          <div className="todo-empty">未來 7 天沒有新任務</div>
        )}
        {upcomingTasks.map((task) => {
          const tone = getTone(task._proj);
          const key = taskKey(task);
          const isDone = !!done[key];
          return (
            <div key={key} className="todo-row">
              <div className={`todo-check ${isDone ? "done" : ""}`}
                   onClick={() => onToggle(key, taskUntil(task))}>
                {isDone && <i className="ti ti-check"></i>}
              </div>
              <div className="todo-text">
                <div className={`todo-name ${isDone ? "done" : ""}`}>{task.n}</div>
                <div className="todo-meta">
                  {task._proj.name} · {fmt(task.start)}–{fmt(task.end)}{task.hours > 0 ? ` · ${task.hours}hr` : ""}
                </div>
              </div>
              <span className="todo-tag" style={{ background: tone.bg, color: tone.ink }}>
                {(PH[task.p] || {}).n || "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
