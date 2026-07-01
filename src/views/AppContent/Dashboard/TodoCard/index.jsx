import { dBt, fmt } from '../../../../lib/dateUtils.js';
import { PH } from '../../../../lib/tasks.js';
import { getTone, WEEK } from '../../shared.js';
import { taskKey, taskUntil } from '../utils.js';
import styles from './TodoCard.module.css';

export default function TodoCard({ tasks, today, done, onToggle, readOnly }) {
  return (
    <div className="card">
      <div className="card-title">
        <span>今日待辦</span>
      </div>
      <p className="card-sub">{today.getMonth() + 1}月{today.getDate()}日 · 週{WEEK[today.getDay()]}</p>
      <div className="todo-list">
        {tasks.length === 0 && <div className="todo-empty">今日空閒，可以喘口氣 ☕</div>}
        {tasks.map((task) => {
          const tone = getTone(task._proj);
          const key = taskKey(task);
          const isDone = !!done[key];
          const endDate = new Date(task.end); endDate.setHours(0, 0, 0, 0);
          const daysLeft = dBt(today, endDate);
          const urgent = daysLeft <= 3;
          return (
            <div key={key} className="todo-row">
              <div className={`todo-check ${isDone ? "done" : ""}${readOnly ? " readonly" : ""}`}
                   onClick={readOnly ? undefined : () => onToggle(key, taskUntil(task))}>
                {isDone && <i className="ti ti-check"></i>}
              </div>
              <div className="todo-text">
                <div className={`todo-name ${isDone ? "done" : ""}`}>{task.n}</div>
                <div className="todo-meta">
                  {task._proj.name} · {fmt(task.start)}–{fmt(task.end)}{task.hours > 0 ? ` · ${task.hours}hr` : ""}
                </div>
              </div>
              <span className={`${styles.daysLeft}${urgent ? " " + styles.urgent : ""}`}>
                剩 {daysLeft} 天
              </span>
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
