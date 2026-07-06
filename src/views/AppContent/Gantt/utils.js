import { TONES } from '../shared.js';
import { PHASE_ORDER } from '../../../lib/tasks.js';

// Gantt 頁兩個視圖(GanttView / CalendarWeek)共用的純函式。

// 專案色調 key(字串),給 CSS Module 的 styles[tone] 查 class 用;
// shared.js 的 getTone 回傳的是 token 物件,兩者用途不同,不混用。
export function toneKey(project) {
  if (project?.tone && TONES[project.tone]) return project.tone;
  return 'lavender';
}

// 期間帶(問卷/募資)排 lane:依開始日排序後,貪婪塞進最早空出來的 lane,
// 讓時間重疊的期間各自佔一條、不互相蓋住。
export function buildPeriodBars(selectedProjects) {
  const bars = [];
  for (const project of selectedProjects) {
    const tone = toneKey(project);
    if (project.surveyStart && project.surveyEnd)
      bars.push({ project, tone, type: 'survey', label: `${project.name}--問卷期間`, start: project.surveyStart, end: project.surveyEnd });
    if (project.campaignStart && project.campaignEnd)
      bars.push({ project, tone, type: 'campaign', label: `${project.name}--募資期間`, start: project.campaignStart, end: project.campaignEnd });
  }
  bars.sort((a, b) => new Date(a.start) - new Date(b.start));
  const laneEnds = [];
  bars.forEach(bar => {
    let placed = false;
    for (let laneIndex = 0; laneIndex < laneEnds.length; laneIndex++) {
      if (new Date(bar.start) >= laneEnds[laneIndex]) {
        bar.lane = laneIndex; laneEnds[laneIndex] = new Date(bar.end); placed = true; break;
      }
    }
    if (!placed) { bar.lane = laneEnds.length; laneEnds.push(new Date(bar.end)); }
  });
  return { periodBars: bars, periodLaneCount: laneEnds.length };
}

// 依開始日貪婪塞 lane:時間重疊的任務各佔一條 lane、不互蓋。
// items 每個元素需有 start / end(Date 或可被 new Date() 解析的值);就地依 start 升冪排序,
// 寫入 item.lane(0-based),回傳 laneCount(＝最大同時重疊數)。純函式:同一組輸入 → 穩定結果,可單測。
// 重疊判定用「嚴格大於」:甘特條以整日欄 inclusive 繪製,起訖同一天(新任務 start === 前一條 end)
// 代表兩條都畫到那一欄 → 視為重疊,得分不同 lane;唯有新任務 start 落在前一條 end 之後(整日不相交)
// 才可共用 lane。若用 >=,同一天的多個任務會全擠回 lane 0、疊在一起、列也撐不開。
export function assignLanes(items) {
  items.sort((a, b) => new Date(a.start) - new Date(b.start));
  const laneEnds = [];
  for (const item of items) {
    let placed = false;
    for (let laneIndex = 0; laneIndex < laneEnds.length; laneIndex++) {
      if (new Date(item.start) > laneEnds[laneIndex]) {
        item.lane = laneIndex; laneEnds[laneIndex] = new Date(item.end); placed = true; break;
      }
    }
    if (!placed) { item.lane = laneEnds.length; laneEnds.push(new Date(item.end)); }
  }
  return laneEnds.length;
}

// 把「本批出現過的相位鍵」依 PHASE_ORDER 排序;不在表內的未知鍵排到最後、保持原順序(不吞任務)。
export function orderedPhaseKeys(presentKeys) {
  const rank = new Map(PHASE_ORDER.map((key, index) => [key, index]));
  return [...presentKeys].sort(
    (a, b) => (rank.has(a) ? rank.get(a) : Infinity) - (rank.has(b) ? rank.get(b) : Infinity),
  );
}

// 回傳該日期所屬週的週日(行事曆模式以週日為一週起點,同 Google Calendar)。
export function sunday(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}
