import { describe, it, expect } from 'vitest';
import { runScheduleV2 } from '../schedulerV2.js';
import { aWD, nWD, addD, fmtF } from '../dateUtils.js';
import { BT } from '../tasks.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const settings = { hoursPerDay: 8, blackouts: [] };
const START = '2026-01-05'; // 週一

/**
 * 產生一個只啟用 phase 3 任務的專案。
 * outsourcedIds: 要標記為外包的任務 id 陣列。
 */
function phase3Proj(outsourcedIds = []) {
  const outsourcedSet = new Set(outsourcedIds);
  return {
    id: 'p',
    name: 'test',
    template: 'pm',
    mode: 'forward',
    startDate: START,
    surveyStart: '', surveyEnd: '',
    campaignStart: '', campaignEnd: '',
    tasks: BT
      .filter((t) => t.p === '3')
      .map((t) => ({ id: t.id, enabled: true, outsourced: outsourcedSet.has(t.id) })),
  };
}

// BT 裡 phase 3 的任務及其原始 w 值（供測試對照）
const PHASE3 = [
  { id: '3.1', w: 0 },
  { id: '3.2', w: 2 },
  { id: '3.3', w: 0 },
  { id: '3.4', w: 0 },
  { id: '3.6', w: 0 },
  { id: '3.7', w: 2 },
];
const PHASE3_IDS = PHASE3.map((t) => t.id);

// ── 全外包：工時驗證 ──────────────────────────────────────────────────────────

describe('外包展開：3.1~3.7 全外包 — 工時', () => {
  let s;
  const { sch } = runScheduleV2([phase3Proj(PHASE3_IDS)], settings);
  s = sch['p'];

  it.each(PHASE3)('父任務 $id 工時應為 0', ({ id }) => {
    expect(s[id]).toBeDefined();
    expect(s[id].hours).toBe(0);
  });

  it.each(PHASE3)('審核子任務 $id.1 工時應為 0.5', ({ id }) => {
    expect(s[id + '.1']).toBeDefined();
    expect(s[id + '.1'].hours).toBe(0.5);
  });
});

// ── 全外包：等待天數驗證 ──────────────────────────────────────────────────────

describe('外包展開：3.1~3.7 全外包 — 等待天數', () => {
  let s;
  const { sch } = runScheduleV2([phase3Proj(PHASE3_IDS)], settings);
  s = sch['p'];

  // 父任務等待天數：Math.ceil(原工時/8) 天
  const PARENT_W = [
    { id: "3.1", expectedW: 1 }, // 原本 w=0, h=6  → Math.ceil(6/8)=1
    { id: "3.2", expectedW: 2 }, // 原本 w=2, h=12  → Math.ceil(12/8)=2
    { id: "3.3", expectedW: 1 }, // 原本 w=0, h=4  → Math.ceil(4/8)=1
    { id: "3.4", expectedW: 1 }, // 原本 w=0, h=1  → Math.ceil(1/8)=1
    { id: "3.6", expectedW: 1 }, // 原本 w=0, h=4  → Math.ceil(4/8)=1
    { id: "3.7", expectedW: 1 }, // 原本 w=1, h=4  → Math.ceil(4/8)=1
  ];

  it.each(PARENT_W)('父任務 $id 等待天數應為 $expectedW', ({ id, expectedW }) => {
    expect(s[id].w).toBe(expectedW);
  });

  it.each(PARENT_W)('父任務 $id waitEnd = end + $expectedW 工作天', ({ id, expectedW }) => {
    const t = s[id];
    expect(fmtF(t.waitEnd)).toBe(fmtF(aWD(t.end, expectedW, [])));
  });

  // 審核子任務等待天數：繼承原任務的 w（例如客戶審核期）
  const CHILD_W = [
    { id: '3.1', expectedW: 0 },  // 原本 w=0 → 子任務 w=0
    { id: '3.2', expectedW: 2 },  // 原本 w=2 → 子任務 w=2
    { id: '3.3', expectedW: 0 },  // 原本 w=0 → 子任務 w=0
    { id: '3.4', expectedW: 0 },  // 原本 w=0 → 子任務 w=0
    { id: '3.6', expectedW: 0 },  // 原本 w=0 → 子任務 w=0
    { id: '3.7', expectedW: 2 },  // 原本 w=2 → 子任務 w=2
  ];

  it.each(CHILD_W)('審核子任務 $id.1 等待天數應為 $expectedW', ({ id, expectedW }) => {
    expect(s[id + '.1'].w).toBe(expectedW);
  });

  it.each(CHILD_W)('審核子任務 $id.1 waitEnd 依 $expectedW 計算', ({ id, expectedW }) => {
    const t = s[id + '.1'];
    if (expectedW === 0) {
      expect(t.waitEnd).toBeNull();
    } else {
      expect(fmtF(t.waitEnd)).toBe(fmtF(aWD(t.end, expectedW, [])));
    }
  });
});

// ── 全外包：子任務依賴父任務 ─────────────────────────────────────────────────

describe('外包展開：3.1~3.7 全外包 — 子任務的依賴與時序', () => {
  let s;
  const { sch } = runScheduleV2([phase3Proj(PHASE3_IDS)], settings);
  s = sch['p'];

  // 子任務必須在父任務 waitEnd 過後才開始
  it.each(PHASE3)('審核子任務 $id.1 必須在父任務 $id waitEnd 後才開始', ({ id }) => {
    const parent = s[id];
    const child  = s[id + '.1'];
    const expectedEarliestStart = nWD(addD(parent.waitEnd, 1), []);
    expect(child.start >= expectedEarliestStart).toBe(true);
  });

  // 連鎖：後一個母任務必須在前一個子任務結束後才能開始
  const CHAIN = [
    { prev: '3.1.1', next: '3.2' },
    { prev: '3.2.1', next: '3.3' },
    { prev: '3.3.1', next: '3.4' },
    { prev: '3.4.1', next: '3.5' },
    { prev: '3.6.1', next: '3.7' },
  ];

  it.each(CHAIN)('$next 必須在 $prev 結束後才開始（連鎖正確）', ({ prev, next }) => {
    expect(s[next].start >= s[prev].end).toBe(true);
  });
});

// ── 全外包：甘特圖 id 正確（不覆蓋父任務）────────────────────────────────────

describe('外包展開：3.1~3.7 全外包 — 排程 key 正確', () => {
  let s;
  const { sch } = runScheduleV2([phase3Proj(PHASE3_IDS)], settings);
  s = sch['p'];

  it('父任務和子任務在排程中應各有獨立 key', () => {
    for (const { id } of PHASE3) {
      expect(s[id], `${id} 應存在`).toBeDefined();
      expect(s[id + '.1'], `${id}.1 應存在`).toBeDefined();
    }
  });

  it('父任務（0h）與子任務（0.5h）不互相覆蓋', () => {
    for (const { id } of PHASE3) {
      expect(s[id].hours).toBe(0);        // 父 = 0h
      expect(s[id + '.1'].hours).toBe(0.5); // 子 = 0.5h
    }
  });

  it('父任務 3.1 起始日應為專案啟動日', () => {
    expect(fmtF(s['3.1'].start)).toBe(START);
  });

  it('父任務 3.1 start === end（0h 即時完成）', () => {
    expect(fmtF(s['3.1'].start)).toBe(fmtF(s['3.1'].end));
  });
});
