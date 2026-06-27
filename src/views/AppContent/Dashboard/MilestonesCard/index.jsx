import { fmt } from '../../../../lib/dateUtils.js';
import { getTone } from '../../shared.js';
import styles from './MilestonesCard.module.css';

export default function MilestonesCard({ projects, miles, onJump }) {
  return (
    <div className={`card ${styles.msCard}`}>
      <div className="card-title">
        <span>里程碑</span>
        <button className="card-icon-btn" onClick={onJump} title="開啟甘特圖">
          <i className="ti ti-chart-gantt"></i>
        </button>
      </div>
      <p className="card-sub">所有專案的問卷與開賣日期</p>
      <div className={styles.msBubbleStack}>
        {projects.map((project) => {
          const tone = getTone(project);
          const milestone = miles[project.id] || {};
          return (
            <div key={project.id} className={styles.msBubble}>
              <div className={styles.msBubbleHead}>
                <span className={styles.dot} style={{ background: tone.bg }}></span>
                <span className={styles.name}>{project.name}</span>
              </div>
              <div className={styles.msRow}>
                <span className={styles.lbl}>問卷上線</span>
                {project.surveyStart
                  ? <span className={styles.val}>{fmt(new Date(project.surveyStart + "T00:00:00"))}</span>
                  : <span className={`${styles.val} ${styles.pend}`}>待定{milestone.eSv ? ` · 最快 ${fmt(milestone.eSv)}` : ""}</span>}
              </div>
              <div className={styles.msRow}>
                <span className={styles.lbl}>募資上線</span>
                {project.campaignStart
                  ? <span className={styles.val}>{fmt(new Date(project.campaignStart + "T00:00:00"))}</span>
                  : <span className={`${styles.val} ${styles.pend}`}>待定{milestone.eCp ? ` · 最快 ${fmt(milestone.eCp)}` : ""}</span>}
              </div>
            </div>
          );
        })}
        {projects.length === 0 && (
          <div className="empty"><i className="ti ti-folder-open"></i>還沒有專案</div>
        )}
      </div>
    </div>
  );
}
