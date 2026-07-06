import { describe, it, expect } from 'vitest';
import {
  hydrateSchedule, freezeSchedule, collectFrozen, collectDownstream, layoutSingleTask, isSchedulable,
} from '../scheduleStore.js';
import { runScheduleV2 } from '../schedulerV2.js';
import { BT } from '../tasks.js';
import { pD } from '../dateUtils.js';

const SETTINGS = { hoursPerDay: 8, blackouts: [] };

// 2020-01-06 / 2020-02-03 都是週一,測試日期都避開週末以免糾結工作日換算。
function makeProject(overrides = {}) {
  return {
    id: 'p1', name: 'Proj', template: 'full',
    startDate: '2020-01-06', surveyStart: '', surveyEnd: '', campaignStart: '', campaignEnd: '',
    tasks: [{ id: '2.1', enabled: true }, { id: '2.2', enabled: true }],
    schedule: {
      '2.1': { start: '2020-01-06', end: '2020-01-07', waitEnd: null, hours: 9, w: 2,
        days: { '2020-01-06': { h: 8, o: 0 }, '2020-01-07': { h: 1, o: 0 } } },
      '2.2': { start: '2020-01-08', end: '2020-01-09', waitEnd: null, hours: 12, w: 2,
        days: { '2020-01-08': { h: 8, o: 0 }, '2020-01-09': { h: 4, o: 0 } } },
    },
    ...overrides,
  };
}

describe('hydrateSchedule', () => {
  it('把已存排程還原成 Date 型別的 record,並從 BT 補回任務名稱', () => {
    const { sch } = hydrateSchedule([makeProject()], SETTINGS);
    const rec = sch.p1['2.1'];
    expect(rec.start).toBeInstanceOf(Date);
    expect(rec.end).toBeInstanceOf(Date);
    expect(rec.start.getTime()).toBe(pD('2020-01-06').getTime());
    expect(rec.n).toBe(BT.find((t) => t.id === '2.1').n);
    expect(rec.days['2020-01-06'].h).toBe(8);
  });

  it('freeze(hydrate(x)) 會 round-trip 回原本的已存形狀', () => {
    const project = makeProject();
    const { sch } = hydrateSchedule([project], SETTINGS);
    expect(freezeSchedule(sch.p1)).toEqual(project.schedule);
  });

  it('停用的任務即使 schedule 還留著也不顯示', () => {
    const project = makeProject({
      tasks: [{ id: '2.1', enabled: true }, { id: '2.2', enabled: false }],
    });
    const { sch } = hydrateSchedule([project], SETTINGS);
    expect(sch.p1['2.1']).toBeTruthy();
    expect(sch.p1['2.2']).toBeUndefined();
  });

  it('schedule 為空物件(新專案)→ 空排程,不 fallback 計算', () => {
    const project = makeProject({ schedule: {} });
    const { sch } = hydrateSchedule([project], SETTINGS);
    expect(sch.p1).toEqual({});
  });

  it('schedule 為 undefined(舊資料)且可排程 → 即時 fallback 算一次', () => {
    const project = makeProject({ schedule: undefined });
    const { sch } = hydrateSchedule([project], SETTINGS);
    expect(Object.keys(sch.p1).length).toBeGreaterThan(0);
  });
});

describe('collectFrozen', () => {
  it('依 predicate 挑出符合的任務(start < 界線)', () => {
    const frozen = collectFrozen([makeProject()], (entry) => entry.start < pD('2020-01-08'));
    expect(Object.keys(frozen.p1)).toEqual(['2.1']); // 2.2 的 start=2020-01-08 不小於界線
  });
});

describe('collectDownstream', () => {
  it('回傳被改任務 + 其相依下游(含自己)', () => {
    const project = {
      tasks: [{ id: '2.1', enabled: true }, { id: '2.2', enabled: true }, { id: '2.3', enabled: true }],
    };
    const set = collectDownstream(project, '2.1'); // 2.1→2.2→2.3
    expect(set.has('2.1')).toBe(true);
    expect(set.has('2.2')).toBe(true);
    expect(set.has('2.3')).toBe(true);

    const set2 = collectDownstream(project, '2.2'); // 只有 2.2、2.3
    expect(set2.has('2.1')).toBe(false);
    expect(set2.has('2.2')).toBe(true);
    expect(set2.has('2.3')).toBe(true);
  });
});

describe('layoutSingleTask', () => {
  it('把工時依每日工時鋪在工作日上,算出 end / days / waitEnd', () => {
    const laid = layoutSingleTask(pD('2020-01-06'), 16, 2, SETTINGS);
    expect(laid.start).toBe('2020-01-06');
    expect(Object.keys(laid.days)).toHaveLength(2); // 16h / 8h = 2 個工作日
    expect(laid.days['2020-01-06'].h).toBe(8);
    expect(laid.end).toBe('2020-01-07');
    expect(laid.waitEnd).toBe('2020-01-09'); // 結束日 +2 工作天
  });

  it('帶 availability:改用該人的每日工時鋪、避開他的休假日', () => {
    // A:每天 4h,且 2020-01-07(週二)休假
    const availability = { dailyHours: 4, daysOff: [{ id: 'v', start: '2020-01-07', end: '2020-01-07' }] };
    const laid = layoutSingleTask(pD('2020-01-06'), 16, 2, SETTINGS, availability);

    expect(laid.days['2020-01-07']).toBeUndefined();               // 休假日不排
    expect(Object.values(laid.days).every((d) => d.h <= 4)).toBe(true); // 每天最多 4h
    // 16h / 4h = 4 個工作日,跳過 01-07:01-06、01-08、01-09、01-10
    expect(Object.keys(laid.days).sort()).toEqual(['2020-01-06', '2020-01-08', '2020-01-09', '2020-01-10']);
    expect(laid.end).toBe('2020-01-10');
    expect(laid.waitEnd).toBe('2020-01-14'); // 01-10 +2 工作天(跳過週末)
  });
});

describe('isSchedulable', () => {
  it('要有啟動日且至少一個 enabled 任務', () => {
    expect(isSchedulable(makeProject())).toBe(true);
    expect(isSchedulable(makeProject({ startDate: '' }))).toBe(false);
    expect(isSchedulable(makeProject({ tasks: [{ id: '2.1', enabled: false }] }))).toBe(false);
  });
});

describe('runScheduleV2 options.frozen / startFloor', () => {
  it('凍結任務維持原日期,未凍結的未來任務不會回填到 startFloor 之前', () => {
    const project = {
      id: 'p1', name: 'Proj', template: 'full',
      startDate: '2020-01-06',
      surveyStart: '', surveyEnd: '', campaignStart: '', campaignEnd: '',
      tasks: [{ id: '2.1', enabled: true }, { id: '2.2', enabled: true }],
    };
    // 2.1 凍結在過去;2.2(相依 2.1)未凍結,應排在 startFloor 之後而非緊接 2.1。
    const frozen = {
      p1: {
        '2.1': { start: '2020-01-06', end: '2020-01-06', waitEnd: null, hours: 8, w: 0,
          days: { '2020-01-06': { h: 8, o: 0 } } },
      },
    };
    const startFloor = pD('2020-02-03');
    const { sch } = runScheduleV2([project], SETTINGS, { frozen, startFloor });

    // 凍結任務原封不動
    expect(sch.p1['2.1'].start.getTime()).toBe(pD('2020-01-06').getTime());
    // 2.2 沒被回填到 1 月,而是排在 startFloor(2/3)之後
    expect(sch.p1['2.2'].start.getTime()).toBeGreaterThanOrEqual(startFloor.getTime());
  });

  it('改每日工時後快速排程:過去任務不動,未來任務用新工時重排且不早於今天', () => {
    // 用非 no-split 的任務鏈(2.1→2.2→2.3):no-split 任務在工時 < 其時數時排不進來(既有行為),
    // 會干擾「新工時是否生效」的驗證,故此測試避開。
    const base = {
      id: 'p1', name: 'P', template: 'full',
      startDate: '2020-01-06',
      surveyStart: '2020-06-01', surveyEnd: '2020-07-01',
      campaignStart: '2020-08-03', campaignEnd: '2020-10-02',
      tasks: ['2.1', '2.2', '2.3'].map((id) => ({ id, enabled: true })),
    };
    // 初始以 8h 排一次並凍結落地。
    const init = runScheduleV2([base], { hoursPerDay: 8, blackouts: [] });
    const initSchedule = freezeSchedule(init.sch.p1);
    const withSchedule = { ...base, schedule: initSchedule };

    // 把「今天」設在初始 2.2 的開始日 → 只有 2.1 屬過去、要凍結;2.2、2.3 是未來。
    const today = pD(initSchedule['2.2'].start);
    const frozen = collectFrozen([withSchedule], (entry) => entry.start && entry.start < today);
    expect(Object.keys(frozen.p1)).toEqual(['2.1']);

    // 改成 4h 重排(＝快速排程做的事)。
    const res = runScheduleV2([withSchedule], { hoursPerDay: 4, blackouts: [] }, { frozen, startFloor: today });
    const after = freezeSchedule(res.sch.p1);

    // 過去任務(2.1)完全不動。
    expect(after['2.1'].start).toBe(initSchedule['2.1'].start);
    expect(after['2.1'].end).toBe(initSchedule['2.1'].end);
    // 未來任務(2.2、2.3)不早於今天。
    for (const id of ['2.2', '2.3']) {
      expect(pD(after[id].start).getTime()).toBeGreaterThanOrEqual(today.getTime());
    }
    // 新工時確實生效:2.2 是 12h,8h/天時 2 天、4h/天時要 3 天。
    expect(Object.keys(init.sch.p1['2.2'].days).length).toBe(2);
    expect(Object.keys(after['2.2'].days).length).toBe(3);
  });
});
