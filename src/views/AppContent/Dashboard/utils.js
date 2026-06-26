import { fmtF } from '../../../lib/dateUtils.js';

// Dashboard 各卡片共用的任務識別工具。
// 完成狀態(打勾/過期關閉)以 taskKey 當唯一鍵,同一任務在今日待辦/近七日活動/過期之間
// 必須算同一筆才能彼此繼承,因此集中一處實作,避免各卡片各自拼鍵走鐘。

// 完成狀態的唯一鍵:專案 id + 任務 id。
export function taskKey(task) {
  return (task._proj?.id || "") + "_" + task.id;
}

// 打勾時一併記錄任務到期日,雲端據此在過期後剪枝完成紀錄。
export function taskUntil(task) {
  return fmtF(task.end);
}
