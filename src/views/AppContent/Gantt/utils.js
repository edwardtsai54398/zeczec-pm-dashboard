import { TONES } from '../shared.js';

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

// 回傳該日期所屬週的週日(行事曆模式以週日為一週起點,同 Google Calendar)。
export function sunday(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}
