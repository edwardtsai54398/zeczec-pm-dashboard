import { describe, it, expect } from 'vitest';
import { runScheduleV2 } from '../schedulerV2.js';
import { fmtF, isWE, isBO } from '../dateUtils.js';
import { BT } from '../tasks.js';

// days 每日分配明細:行事曆週檢視依 { 'YYYY-MM-DD': { h, o } } 畫任務區塊,
// 這裡驗證排程器輸出的明細滿足「加總正確、不爆格、不重疊」等不變量。

const settings = { hoursPerDay: 8, blackouts: [] };
const START = '2026-05-19';

const p1Dates = { surveyStart: '2026-07-06', campaignStart: '2026-08-17' };
const p2Config = {
  startDate: '2026-05-23',
  surveyStart: '2026-06-23',
  campaignStart: '2026-08-13',
  campaignEnd: '2026-10-14',
};

// proj: 永遠輸出 BT 所有任務,符合實際使用情境(同 schedulerV2.test.js)
function proj(id, startDate, extra = {}) {
  return {
    id, name: id, template: 'full',
    startDate,
    surveyStart: '', surveyEnd: '',
    campaignStart: '', campaignEnd: '',
    tasks: BT.map((bt) => ({ id: bt.id, enabled: true })),
    ...extra,
  };
}

// 把排程結果攤平成「日期 → 當日所有分配」的索引,方便跨任務/跨專案驗證
function collectByDate(sch) {
  const byDate = {};
  for (const tasks of Object.values(sch)) {
    for (const task of Object.values(tasks)) {
      for (const [dateKey, { h, o }] of Object.entries(task.days || {})) {
        (byDate[dateKey] ??= []).push({ id: task.id, h, o });
      }
    }
  }
  return byDate;
}

describe('days 明細:單一專案', () => {
  const p = proj('p', START, p1Dates);

  it('每筆 record 都帶有 days 物件', () => {
    const { sch } = runScheduleV2([p], settings);
    for (const task of Object.values(sch['p'])) {
      expect(task.days).toBeTypeOf('object');
    }
  });

  it('hours > 0 的任務:days 非空且各日 h 加總等於 hours', () => {
    const { sch } = runScheduleV2([p], settings);
    for (const task of Object.values(sch['p'])) {
      if (task.hours === 0) continue;
      const entries = Object.values(task.days);
      expect(entries.length).toBeGreaterThan(0);
      const sum = entries.reduce((total, { h }) => total + h, 0);
      expect(sum).toBeCloseTo(task.hours);
    }
  });

  it('0 工時任務:days 恰有一個 key = start 當天,h = 0', () => {
    const { sch } = runScheduleV2([p], settings);
    const zeroTasks = Object.values(sch['p']).filter((task) => task.hours === 0);
    expect(zeroTasks.length).toBeGreaterThan(0);
    for (const task of zeroTasks) {
      const keys = Object.keys(task.days);
      expect(keys).toEqual([fmtF(task.start)]);
      expect(task.days[keys[0]].h).toBe(0);
    }
  });

  it('day key 都落在任務的 start 與 end 之間', () => {
    const { sch } = runScheduleV2([p], settings);
    for (const task of Object.values(sch['p'])) {
      for (const dateKey of Object.keys(task.days)) {
        expect(dateKey >= fmtF(task.start)).toBe(true);
        expect(dateKey <= fmtF(task.end)).toBe(true);
      }
    }
  });

  it('有工時分配的日子不會是週末或請假日', () => {
    const vacation = [{ id: 'v', start: '2026-06-10', end: '2026-06-16' }];
    const { sch } = runScheduleV2([p], { hoursPerDay: 8, blackouts: vacation });
    for (const task of Object.values(sch['p'])) {
      // 釘選發文任務(0 工時)可落在週末,不受工作日限制,略過
      if (task.hours === 0) continue;
      for (const dateKey of Object.keys(task.days)) {
        const date = new Date(dateKey + 'T00:00:00');
        expect(isWE(date)).toBe(false);
        expect(isBO(date, vacation)).toBe(false);
      }
    }
  });
});

describe('days 明細:雙專案共享每日容量', () => {
  const p1 = proj('p1', START, p1Dates);
  const p2 = proj('p2', p2Config.startDate, {
    surveyStart: p2Config.surveyStart,
    campaignStart: p2Config.campaignStart,
    campaignEnd: p2Config.campaignEnd,
  });

  it('任一天跨專案 h 加總 ≤ hoursPerDay', () => {
    const { sch } = runScheduleV2([p1, p2], settings);
    const byDate = collectByDate(sch);
    for (const [dateKey, entries] of Object.entries(byDate)) {
      const sum = entries.reduce((total, { h }) => total + h, 0);
      expect(sum, `date ${dateKey}`).toBeLessThanOrEqual(settings.hoursPerDay + 1e-9);
    }
  });

  it('任一天依 o 排序後區塊不重疊,且第一塊從 0 開始', () => {
    const { sch } = runScheduleV2([p1, p2], settings);
    const byDate = collectByDate(sch);
    let daysWithWork = 0;
    for (const [dateKey, entries] of Object.entries(byDate)) {
      const positive = entries.filter((entry) => entry.h > 0);
      if (positive.length === 0) continue;
      daysWithWork++;
      const sorted = [...positive].sort((a, b) => a.o - b.o);
      expect(sorted[0].o, `date ${dateKey}`).toBe(0);
      for (let i = 1; i < sorted.length; i++) {
        expect(
          sorted[i].o + 1e-9 >= sorted[i - 1].o + sorted[i - 1].h,
          `date ${dateKey}: ${sorted[i - 1].id} 與 ${sorted[i].id} 重疊`,
        ).toBe(true);
      }
    }
    expect(daysWithWork).toBeGreaterThan(0);
  });
});

describe('days 明細:pinnedStart 釘選任務', () => {
  const PINNED = '2026-06-03';

  function projWithPinnedStart(id) {
    return {
      id, name: id, template: 'full',
      startDate: START,
      surveyStart: p1Dates.surveyStart, campaignStart: p1Dates.campaignStart,
      tasks: BT.map((bt) => ({
        id: bt.id, enabled: true,
        ...(bt.id === '2.2' ? { pinnedStart: PINNED } : {}),
      })),
    };
  }

  it('釘選任務整包工時記在釘選日,offset 為 0', () => {
    const { sch } = runScheduleV2([projWithPinnedStart('p')], settings);
    const task = sch['p']['2.2'];
    expect(fmtF(task.start)).toBe(PINNED);
    expect(task.days).toEqual({ [PINNED]: { h: task.hours, o: 0 } });
  });
});
