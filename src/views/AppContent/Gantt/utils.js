import { TONES } from '../shared.js';
import { PHASE_ORDER } from '../../../lib/tasks.js';
import { MEMBER_PALETTE, MEMBER_UNASSIGNED_COLOR } from '../../../constants.js';

// Gantt 頁兩個視圖(GanttView / CalendarWeek)共用的純函式。

// 任務的 assignee 該歸哪個成員桶:非 owner 的現有成員 → 該成員本人;其餘(未指派 /
// 指到 owner / 指到已離開工作區的成員)一律歸 owner。owner 尚未載入(ownerId=null)時暫回 null。
// 與 ProjectPage 下拉預設、排程容量算法一致——「未指派讀作 owner」。GanttView 分列與
// CalendarWeek 成員過濾共用同一條規則,避免兩邊分桶結果不一致。
export function bucketFor(assignee, ownerId, memberIdSet) {
  return assignee && assignee !== ownerId && memberIdSet.has(assignee)
    ? assignee
    : (ownerId ?? null);
}

// 依成員在清單中的順序循環發 MEMBER_PALETTE,回傳 Map<user_id, 色碼>。
// 順序穩定 → 同一份成員清單每次配到同色;超過調色盤長度就繞回頭。
export function buildMemberColors(members) {
  const colors = new Map();
  (members || []).forEach((member, index) => {
    colors.set(member.user_id, MEMBER_PALETTE[index % MEMBER_PALETTE.length]);
  });
  return colors;
}

// 某成員(或未指派桶)的顏色;查不到退回中性灰。
export function memberColorOf(colors, memberId) {
  if (memberId == null) return MEMBER_UNASSIGNED_COLOR;
  return colors.get(memberId) || MEMBER_UNASSIGNED_COLOR;
}

// 行事曆某一天內、以「小時區間」錯開重疊區塊(比照 Google 日檢視):
// 每個 block 需有數值 offset(當日第幾小時起)與 hours(佔幾小時),區間為 [offset, offset+hours)。
// 依 offset 升冪貪婪塞欄,一串彼此重疊的區塊組成一個「群」,同群共用欄數 cols(該群同時並存的最大欄數),
// 群與群之間(時間不相交)各自算 cols——所以不重疊的區塊會是 cols=1(整寬),只有真的撞在一起才縮窄。
// 回傳 Map<block, { col, cols }>(以 block 物件參照為 key,不改動輸入)。
export function layoutDayColumns(blocks) {
  const sorted = [...blocks].sort((a, b) => a.offset - b.offset || b.hours - a.hours);
  const result = new Map();
  let cluster = [];       // 當前重疊群:[{ block, col }]
  let clusterEnd = -Infinity;
  const colEnds = [];     // 每欄目前佔用到的 end

  const flush = () => {
    const cols = colEnds.length;
    for (const { block, col } of cluster) result.set(block, { col, cols });
    cluster = [];
    colEnds.length = 0;
    clusterEnd = -Infinity;
  };

  for (const block of sorted) {
    const start = block.offset;
    const end = block.offset + block.hours;
    if (cluster.length && start >= clusterEnd) flush(); // 與整群都不重疊 → 收掉舊群、開新群
    let col = colEnds.findIndex((colEnd) => colEnd <= start);
    if (col === -1) { col = colEnds.length; colEnds.push(end); }
    else colEnds[col] = end;
    cluster.push({ block, col });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();
  return result;
}

// 時鐘標籤:給行事曆時間軸 gutter 用。8→'上午8點'、13→'下午1點'、12→'中午12點'。
export function hourLabel(hour) {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return '午夜12點';
  if (normalized === 12) return '中午12點';
  if (normalized < 12) return `上午${normalized}點`;
  return `下午${normalized - 12}點`;
}

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
