// scheduleTime.js —— 「日內時鐘 ↔ 排程 offset/工時」換算層(純函式)。
// 行事曆的垂直位置存在 schedule[taskId].days[dateKey].o(日內位移,以 SCHEDULE_START_HOUR
// 為第 0 小時)。彈窗與拖拉都用「時鐘(自午夜起的分鐘數)」跟使用者互動,這支負責兩端轉換,
// 並在「開始時鐘 + 工時」與「結束時鐘」之間互推(結束時間不落地,一律由 start + hours 推導)。
import { pD, fmtF, addD, isWE, isBO } from './dateUtils.js';
import { layoutSingleTask } from './scheduleStore.js';
import { GRID_START_HOUR, GRID_END_HOUR, SCHEDULE_START_HOUR } from '../constants.js';

// 拖拉/縮放對齊間隔:30 分鐘一格(＝工時 0.5 小時)。
export const SNAP_MIN = 30;
export const snapMin = (min) => Math.round(min / SNAP_MIN) * SNAP_MIN;

// 時鐘(分鐘)↔ 日內位移 o(小時,可為負/小數)。o = 開始時鐘 − SCHEDULE_START_HOUR。
export const clockMinToOffset = (min) => min / 60 - SCHEDULE_START_HOUR;
export const offsetToClockMin = (o) => Math.round((SCHEDULE_START_HOUR + o) * 60);

// 把開始時鐘夾在格線可視範圍內(不早於 8:00、不晚於 23:30),避免區塊畫到格線外。
export const clampStartMin = (min) =>
  Math.max(GRID_START_HOUR * 60, Math.min(min, GRID_END_HOUR * 60 - SNAP_MIN));

const isWorkday = (date, daysOff) => !isWE(date) && !isBO(date, daysOff);

// 開始(日 + 時鐘)+ 工時 → 結束(日 + 時鐘)。直接複用 layoutSingleTask 的鋪排結果,
// 讀最後一天的 o+h 換回時鐘,確保與實際落地的區塊完全一致。
export function deriveEnd(startDay, startMin, hours, availability, settings) {
  const startOffsetHours = clockMinToOffset(startMin);
  const entry = layoutSingleTask(pD(startDay), hours, 0, settings, availability, startOffsetHours);
  const lastKey = entry.end;
  const last = entry.days[lastKey] || { h: 0, o: startOffsetHours };
  return { endDay: lastKey, endMin: offsetToClockMin(last.o + last.h) };
}

// 開始(日 + 時鐘)+ 結束(日 + 時鐘)→ 工時。deriveEnd 的反函式:
//   同一天：(endMin − startMin) / 60。
//   跨日：第一天鋪滿一日工時(hpd)、中間每個工作日各 hpd、最後一天從頂端(10:00)到 endMin。
// 結束早於或等於開始 → 0(＝0 工時)。
export function workingHoursBetween(startDay, startMin, endDay, endMin, availability, settings) {
  const hpd = availability?.dailyHours ?? (settings?.hoursPerDay || 8);
  const daysOff = availability?.daysOff ?? [];
  const start = pD(startDay);
  const end = pD(endDay);
  if (!start || !end || end < start) return 0;
  if (startDay === endDay) return Math.max(0, (endMin - startMin) / 60);

  let total = hpd; // 跨日代表第一天鋪滿一整日工時
  for (let day = addD(start, 1); fmtF(day) < endDay; day = addD(day, 1)) {
    if (isWorkday(day, daysOff)) total += hpd;
  }
  total += Math.max(0, endMin / 60 - SCHEDULE_START_HOUR); // 最後一天從 10:00 到 endMin
  return total;
}
