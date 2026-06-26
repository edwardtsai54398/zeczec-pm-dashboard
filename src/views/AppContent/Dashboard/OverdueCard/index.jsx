import { useState } from 'react';
import { dBt } from '../../../../lib/dateUtils.js';
import { PH } from '../../../../lib/tasks.js';
import { getTone } from '../../shared.js';
import { taskKey } from '../utils.js';
import styles from './OverdueCard.module.css';

export function OverdueCard({ tasks, today, dismissed, onDismiss }) {
  const [expanded, setExpanded] = useState(false);

  const visible = tasks.filter((task) => !dismissed[taskKey(task)]);

  if (visible.length === 0) return null;

  const shown = expanded ? visible : visible.slice(0, 5);
  const remaining = visible.length - 5;

  return (
    <div className={`card ${styles.overdueCard}`}>
      <div className="card-title">
        <span>過期未完成</span>
        <span className={styles.overdueBadge}>{visible.length}</span>
      </div>
      <p className="card-sub">已超過結束日期但尚未完成的任務</p>
      <div className="todo-list">
        {shown.map((task) => {
          const tone = getTone(task._proj);
          const daysLate = dBt(new Date(task.end), today);
          const key = taskKey(task);
          return (
            <div key={key} className="todo-row">
              <div className="todo-check" onClick={() => onDismiss(key)}></div>
              <div className="todo-text">
                <div className="todo-name">{task.n}</div>
                <div className="todo-meta">
                  {task._proj.name} · 逾期 {daysLate} 天
                </div>
              </div>
              <span className="todo-tag" style={{ background: tone.bg, color: tone.ink }}>
                {(PH[task.p] || {}).n || "—"}
              </span>
            </div>
          );
        })}
        {!expanded && remaining > 0 && (
          <div className={styles.showMore} onClick={() => setExpanded(true)}>
            還有 {remaining} 項...
          </div>
        )}
        {expanded && visible.length > 5 && (
          <div className={styles.showMore} onClick={() => setExpanded(false)}>
            收起
          </div>
        )}
      </div>
    </div>
  );
}
