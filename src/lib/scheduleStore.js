// scheduleStore.js —— 排程「落地/水合」層。
// 改版後排程不再每次載入即時算,而是把 schedulerV2 算出的結果凍結成 project.schedule 落地;
// 這支檔負責在讀寫兩端轉換:
//   hydrateSchedule: 讀 project.schedule → 重建與 makeRecord 相同形狀的 { sch, miles }(消費端零改動)。
//   freezeSchedule:  把 runScheduleV2 的 sch[pid] records → 可序列化落地的 schedule map。
//   collectFrozen:   依 predicate 從已存 schedule 挑出要凍結的任務 → runScheduleV2 的 options.frozen。
import { BT } from './tasks.js';
import { runScheduleV2, deriveMilestones } from './schedulerV2.js';
import {
  pD as parseDate,
  fmtF as formatDateKey,
  addD as addDays,
  nWD as nextWorkDay,
  aWD as addWorkDays,
  isWE as isWeekend,
  isBO as isBlackout,
} from './dateUtils.js';

// 由執行期 id 還原任務敘述性欄位:先查 BT,再處理外包展開的 .1 審核子任務(名稱前綴「(審核)」),
// 最後才是使用者手動新增的自訂任務——它不在 BT,敘述(名稱 n / 相位 p)自帶在 project.tasks 那筆上。
function baseTaskFor(project, taskId) {
  const direct = BT.find((t) => t.id === taskId);
  if (direct) return direct;
  if (taskId.endsWith('.1')) {
    const parent = BT.find((t) => t.id === taskId.slice(0, -2));
    if (parent) return { ...parent, n: `(審核)${parent.n}` };
  }
  const custom = (project.tasks || []).find((t) => t.id === taskId && t.custom);
  if (custom) return { id: taskId, n: custom.n, p: custom.p };
  return null;
}

// 這個任務目前是否仍啟用(外包展開的 .1 審核子任務依父任務 enabled && outsourced)。
// 停用的任務即使 schedule 還留著,也不該顯示在行事曆/甘特圖。
// 注意:真實 BT 任務(如 2.1 / 3.1)本身就以「.1」結尾,不能誤判成外包子任務——
// 外包子任務是「<真實父任務 id>.1」(父 id 本身含點,如 2.8.1),且不在 BT 裡。
function isSyntheticReview(taskId) {
  return taskId.endsWith('.1') && !BT.some((t) => t.id === taskId);
}
function taskEnabled(project, taskId) {
  const tasks = project.tasks || [];
  if (isSyntheticReview(taskId)) {
    const parent = tasks.find((t) => t.id === taskId.slice(0, -2));
    return !!(parent && parent.enabled && parent.outsourced);
  }
  return !!tasks.find((t) => t.id === taskId && t.enabled);
}

// 任務負責人:assignee 存在 project.tasks[].assignee(非 BT 敘述、也不落地進 schedule),
// 所以水合時要從 project.tasks 反查補回,record 才跟 makeRecord 同形狀(帶 assignee)。
// 外包展開的 .1 審核子任務跟父任務同一負責人(比照 makeRecord)。缺省(未指派)= null。
function assigneeFromProject(project, taskId) {
  const lookupId = isSyntheticReview(taskId) ? taskId.slice(0, -2) : taskId;
  return (project.tasks || []).find((t) => t.id === lookupId)?.assignee ?? null;
}

// 一筆已存 schedule entry → makeRecord 形狀的 record(日期字串轉回 Date)。
function recordFromStored(project, taskId, stored) {
  const base = baseTaskFor(project, taskId);
  if (!base) return null;
  const days = stored.days || {};
  const hours = stored.hours != null
    ? stored.hours
    : Object.values(days).reduce((sum, d) => sum + (d.h || 0), 0);
  return {
    ...base,
    id:      taskId,
    hours,
    w:       stored.w != null ? stored.w : (base.w || 0),
    start:   parseDate(stored.start),
    end:     parseDate(stored.end),
    waitEnd: stored.waitEnd ? parseDate(stored.waitEnd) : null,
    days,
    pid:     project.id,
    pn:      project.name,
    effH:    hours,
    // assignee 供行事曆/資源視圖以人為軸分桶;落地 schedule 沒存,從 project.tasks 反查。
    assignee: assigneeFromProject(project, taskId),
  };
}

// 尚未快速排程但「可排程」的專案:有啟動日 + 至少一個啟用任務。
export function isSchedulable(project) {
  return !!project.startDate && (project.tasks || []).some((t) => t.enabled);
}

// 讀所有專案 project.schedule → { sch, miles }。
// 沒有 schedule 但可排程的既有專案(遷移寫回完成前),即時 fallback 算一次避免行事曆瞬間空白;
// 遷移寫回、project.schedule 出現後就改讀落地資料,不再即時算。
export function hydrateSchedule(projects, settings) {
  const blackouts = [];
  const sch = {};
  const miles = {};
  const needCompute = [];

  for (const project of projects) {
    const pid = project.id;
    const stored = project.schedule;
    if (stored === undefined || stored === null) {
      // schedule 欄位不存在 = 改版前的舊資料還沒遷移:可排程的先即時 fallback 算一次
      // (避免遷移寫回前行事曆空白),不可排程的給空。新專案是 schedule:{} 不會走這裡。
      if (isSchedulable(project)) {
        needCompute.push(project);
      } else {
        sch[pid] = {};
        miles[pid] = deriveMilestones([], project, blackouts);
      }
    } else {
      // 已有 schedule 欄位(含空物件 {} = 新專案還沒快速排程):直接讀落地資料,不 fallback。
      sch[pid] = {};
      const records = [];
      for (const taskId of Object.keys(stored)) {
        if (!taskEnabled(project, taskId)) continue;
        const rec = recordFromStored(project, taskId, stored[taskId]);
        if (rec) { sch[pid][taskId] = rec; records.push(rec); }
      }
      miles[pid] = deriveMilestones(records, project, blackouts);
    }
  }

  if (needCompute.length > 0) {
    const res = runScheduleV2(needCompute, settings);
    for (const project of needCompute) {
      sch[project.id] = res.sch[project.id] || {};
      miles[project.id] = res.miles[project.id] || deriveMilestones([], project, blackouts);
    }
  }

  return { sch, miles };
}

// sch[pid] records(makeRecord 形狀)→ 可序列化落地的 schedule map。
export function freezeSchedule(schForPid) {
  const out = {};
  for (const taskId of Object.keys(schForPid || {})) {
    const rec = schForPid[taskId];
    out[taskId] = {
      start:   formatDateKey(rec.start),
      end:     formatDateKey(rec.end),
      waitEnd: rec.waitEnd ? formatDateKey(rec.waitEnd) : null,
      hours:   rec.hours,
      w:       rec.w,
      days:    rec.days || {},
    };
  }
  return out;
}

// 使用者手動新增的自訂任務不進排程器(runScheduleV2 只認 BT),重算後 freezeSchedule 不會有它們;
// 這支把 project 既有 schedule 裡屬於自訂任務的落地 entry 原封補回,避免快速排程/重排時被洗掉。
export function preserveCustomTasks(project, schedule) {
  const customIds = new Set((project.tasks || []).filter((t) => t.custom).map((t) => t.id));
  const merged = { ...schedule };
  for (const id of customIds) {
    if (project.schedule?.[id]) merged[id] = project.schedule[id];
  }
  return merged;
}

// 從所有專案已存 schedule 挑出符合 predicate 的任務 → runScheduleV2 的 options.frozen。
// predicate(entry, taskId, project) → boolean;entry.start / entry.end 已 parse 成 Date。
export function collectFrozen(projects, predicate) {
  const frozen = {};
  for (const project of projects) {
    const stored = project.schedule || {};
    for (const taskId of Object.keys(stored)) {
      const s = stored[taskId];
      const entry = {
        start:   parseDate(s.start),
        end:     parseDate(s.end),
        waitEnd: s.waitEnd ? parseDate(s.waitEnd) : null,
        hours:   s.hours,
        w:       s.w,
        days:    s.days || {},
      };
      if (!predicate(entry, taskId, project)) continue;
      // runScheduleV2 的 frozen entry 用字串日期(它內部再 parseDate),直接沿用已存值
      (frozen[project.id] ||= {})[taskId] = s;
    }
  }
  return frozen;
}

// 「只改這一個任務」用的單人 placer:從 startDate 起,把 hours 依「該任務 assignee 的每日工時」
// 鋪在工作日上(避開他的休假日),算出 end/days/waitEnd。不看其他任務、不管容量衝突
// (使用者已選擇只動這一個),回傳可直接寫入 schedule 的字串形狀 entry。
// availability = { dailyHours, daysOff };省略時退回工作區每日工時、無休假(＝改版前行為)。
// startOffsetHours = 手動排定的日內開始位移(o,以 SCHEDULE_START_HOUR 為第 0 小時),
// 只套用在第一天;後續天一律從頂端(o=0)接續。省略＝0(改版前行為,畫在 10:00)。
export function layoutSingleTask(startDate, hours, wait, settings, availability, startOffsetHours = 0) {
  const hoursPerDay = availability?.dailyHours ?? (settings?.hoursPerDay || 8);
  const blackouts = availability?.daysOff ?? [];
  const startDay = nextWorkDay(startDate, blackouts);
  const days = {};
  let end = startDay;
  if (hours <= 0) {
    // 0 工時任務畫成全天 chip,o 不影響顯示,仍記著位移保持形狀一致。
    days[formatDateKey(startDay)] = { h: 0, o: startOffsetHours };
  } else {
    let day = startDay;
    let remaining = hours;
    let isFirst = true;
    while (remaining > 0) {
      if (!isWeekend(day) && !isBlackout(day, blackouts)) {
        const h = Math.min(remaining, hoursPerDay);
        days[formatDateKey(day)] = { h, o: isFirst ? startOffsetHours : 0 };
        remaining -= h;
        end = day;
        isFirst = false;
      }
      if (remaining > 0) day = addDays(day, 1);
    }
  }
  const waitEnd = wait > 0 ? addWorkDays(end, wait, blackouts) : null;
  return {
    start:   formatDateKey(startDay),
    end:     formatDateKey(end),
    waitEnd: waitEnd ? formatDateKey(waitEnd) : null,
    hours,
    w:       wait,
    days,
  };
}

// 「自動重排後面的任務」用:回傳「被改任務 + 相依於它的所有下游」的 id 集合(含 rootId 本身、
// 以及外包 .1 審核子任務)。依 BT 的相依圖(t.d 指向其依賴)反向展開。
export function collectDownstream(project, rootId) {
  const enabled = new Set((project.tasks || []).filter((t) => t.enabled).map((t) => t.id));
  const outsourced = new Set(
    (project.tasks || []).filter((t) => t.enabled && t.outsourced).map((t) => t.id),
  );
  const dependents = {}; // dep id → [依賴它的任務 id]
  for (const t of BT) {
    if (!enabled.has(t.id)) continue;
    for (const dep of (t.d || [])) (dependents[dep] ||= []).push(t.id);
  }
  const reflow = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    for (const dep of (dependents[cur] || [])) {
      if (!reflow.has(dep)) { reflow.add(dep); stack.push(dep); }
    }
  }
  for (const id of [...reflow]) if (outsourced.has(id)) reflow.add(id + '.1');
  return reflow;
}
