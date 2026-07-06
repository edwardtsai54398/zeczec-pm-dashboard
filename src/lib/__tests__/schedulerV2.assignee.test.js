import { describe, it, expect } from 'vitest';
import { runScheduleV2 } from '../schedulerV2.js';
import { fmtF } from '../dateUtils.js';

// M2:每天容量從「全域一桶」改成「每個 assignee 一桶」。
// 這裡驗證:同一天不同成員各自平行、成員自訂每日工時、成員休假日、以及「未傳 members = 單桶」向後相容。

const settings = { hoursPerDay: 8, blackouts: [] };
const START = '2026-05-18';

// 三個成員:owner + 兩位 editor,各自 8h/day
const members = [
  { user_id: 'owner1', role: 'owner', settings: {} },
  { user_id: 'A', role: 'editor', settings: { daily_hours: 8 } },
  { user_id: 'B', role: 'editor', settings: { daily_hours: 8 } },
];

// 只啟用「一個沒有相依、沒有 minStart」的任務,方便精準推理容量分配。
// 2.1 = 9h、3.1 = 6h,兩者 d:[] 且無 minStart(未填問卷/募資日 → deadline 也為 null)。
function oneTaskProj(id, taskId, assignee) {
  return {
    id, name: id, template: 'full',
    startDate: START,
    surveyStart: '', surveyEnd: '', campaignStart: '', campaignEnd: '',
    tasks: [{ id: taskId, enabled: true, ...(assignee ? { assignee } : {}) }],
  };
}

// 某一天跨所有專案/任務的實際工時加總
function sumOn(sch, dateKey) {
  let total = 0;
  for (const tasks of Object.values(sch)) {
    for (const task of Object.values(tasks)) {
      total += task.days?.[dateKey]?.h || 0;
    }
  }
  return total;
}

describe('per-assignee 容量:平行 vs 共桶', () => {
  it('兩任務指派給不同成員 → 同一天各做各的(當日總工時可超過單人上限)', () => {
    const p1 = oneTaskProj('p1', '2.1', 'A'); // 9h → A
    const p2 = oneTaskProj('p2', '3.1', 'B'); // 6h → B
    const { sch } = runScheduleV2([p1, p2], settings, { members });

    const startKey = fmtF(sch.p1['2.1'].start);
    // A 當天做滿 8h(2.1 尚餘 1h 隔天做);B 當天把 6h 做完 —— 同一天合計 14h > 8
    expect(sch.p2['3.1'].days[startKey].h).toBe(6);
    expect(sumOn(sch, startKey)).toBeGreaterThan(settings.hoursPerDay);
  });

  it('兩任務指派給同一成員 → 共用那個人一桶(不平行,當日 ≤ 該人每日工時)', () => {
    const p1 = oneTaskProj('p1', '2.1', 'A');
    const p2 = oneTaskProj('p2', '3.1', 'A'); // 都給 A
    const { sch } = runScheduleV2([p1, p2], settings, { members });

    const startKey = fmtF(sch.p1['2.1'].start);
    expect(sumOn(sch, startKey)).toBeLessThanOrEqual(settings.hoursPerDay + 1e-9);
  });
});

describe('per-assignee 容量:自訂每日工時', () => {
  it('成員 daily_hours=4 → 該人任務每天最多做 4h', () => {
    const membersA4 = [{ user_id: 'A', role: 'editor', settings: { daily_hours: 4 } }];
    const p1 = oneTaskProj('p1', '2.1', 'A'); // 9h
    const { sch } = runScheduleV2([p1], settings, { members: membersA4 });

    for (const { h } of Object.values(sch.p1['2.1'].days)) {
      expect(h).toBeLessThanOrEqual(4 + 1e-9);
    }
    // 9h / 4h per day → 攤在 3 個工作日(4 + 4 + 1)
    expect(Object.keys(sch.p1['2.1'].days).length).toBe(3);
  });
});

describe('per-assignee 容量:成員休假日', () => {
  it('該人任務跳過休假日並順延,同一天別的成員照常上工', () => {
    // 先跑一次拿到自然起始日
    const base = runScheduleV2([oneTaskProj('p1', '2.1', 'A')], settings, { members });
    const naturalStart = fmtF(base.sch.p1['2.1'].start);

    // 讓 A 在自然起始日當天休假,B 不受影響
    const membersOff = members.map((member) =>
      member.user_id === 'A'
        ? { ...member, settings: { ...member.settings, days_off: [{ id: 'v', name: '假', start: naturalStart, end: naturalStart }] } }
        : member,
    );
    const { sch } = runScheduleV2(
      [oneTaskProj('p1', '2.1', 'A'), oneTaskProj('p2', '3.1', 'B')],
      settings,
      { members: membersOff },
    );

    // A 的任務:休假當天 0 進度(days 沒有那天),起始日往後挪
    expect(sch.p1['2.1'].days[naturalStart]).toBeUndefined();
    expect(fmtF(sch.p1['2.1'].start) > naturalStart).toBe(true);
    // B 的任務:那天照常做完 6h(休假是 per-bucket 歸零,不是整天跳過)
    expect(sch.p2['3.1'].days[naturalStart]?.h).toBe(6);
  });
});

describe('向後相容:未傳 members / 未設 assignee = 單桶', () => {
  it('未傳 members → 跨專案當日總工時仍 ≤ hoursPerDay(共用同一桶)', () => {
    const p1 = oneTaskProj('p1', '2.1'); // 未指派
    const p2 = oneTaskProj('p2', '3.1');
    const { sch } = runScheduleV2([p1, p2], settings); // 不傳 members

    const startKey = fmtF(sch.p1['2.1'].start);
    expect(sumOn(sch, startKey)).toBeLessThanOrEqual(settings.hoursPerDay + 1e-9);
  });
});
