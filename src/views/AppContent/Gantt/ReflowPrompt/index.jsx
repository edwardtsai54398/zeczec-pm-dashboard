import styles from './ReflowPrompt.module.css';

// 「先套用再問」的小提示:拖拉/縮放或彈窗存檔後,若該任務有下游,問要不要把後面一起重排。
export default function ReflowPrompt({ onReschedule, onDismiss }) {
  return (
    <div className={styles.toast}>
      <i className={`ti ti-arrows-move-vertical ${styles.icon}`}></i>
      <span className={styles.text}>已更新這個任務。後面依賴它的任務要一起往後重排嗎？</span>
      <button className={styles.dismiss} onClick={onDismiss}>不用</button>
      <button className={styles.reschedule} onClick={onReschedule}>重排後面</button>
    </div>
  );
}
