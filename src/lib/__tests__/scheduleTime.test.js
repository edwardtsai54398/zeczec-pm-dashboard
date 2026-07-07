import { describe, it, expect } from 'vitest';
import {
  snapMin, clockMinToOffset, offsetToClockMin, clampStartMin,
  deriveEnd, workingHoursBetween,
} from '../scheduleTime.js';
import { layoutSingleTask } from '../scheduleStore.js';

// 每日 8 工時、無休假。2026-07-06 是週一,週五 = 2026-07-10。
const avail = { dailyHours: 8, daysOff: [] };
const settings = { hoursPerDay: 8 };
const MON = '2026-07-06';
const TUE = '2026-07-07';
const FRI = '2026-07-10';
const NEXT_MON = '2026-07-13';

describe('snapMin: 對齊 30 分', () => {
  it('四捨五入到最近的 30 分格', () => {
    expect(snapMin(0)).toBe(0);
    expect(snapMin(14)).toBe(0);
    expect(snapMin(15)).toBe(30);
    expect(snapMin(44)).toBe(30);
    expect(snapMin(45)).toBe(60);
    expect(snapMin(-40)).toBe(-30);
  });
});

describe('時鐘(分) ↔ 日內位移 o(小時)', () => {
  it('10:00 → o=0、14:00 → o=4,且互為反函式', () => {
    expect(clockMinToOffset(10 * 60)).toBe(0);
    expect(clockMinToOffset(14 * 60)).toBe(4);
    expect(offsetToClockMin(0)).toBe(10 * 60);
    expect(offsetToClockMin(4)).toBe(14 * 60);
    expect(offsetToClockMin(clockMinToOffset(13 * 60 + 30))).toBe(13 * 60 + 30);
  });
});

describe('clampStartMin: 夾在 8:00–23:30', () => {
  it('過早補到 8:00、過晚補到 23:30、範圍內不動', () => {
    expect(clampStartMin(7 * 60)).toBe(8 * 60);
    expect(clampStartMin(23 * 60 + 45)).toBe(23 * 60 + 30);
    expect(clampStartMin(12 * 60)).toBe(12 * 60);
  });
});

describe('deriveEnd: 開始 + 工時 → 結束', () => {
  it('同一天(10:00 + 4h → 當天 14:00)', () => {
    expect(deriveEnd(MON, 10 * 60, 4, avail, settings)).toEqual({ endDay: MON, endMin: 14 * 60 });
  });

  it('晚一點開始也對(14:00 + 4h → 當天 18:00)', () => {
    expect(deriveEnd(MON, 14 * 60, 4, avail, settings)).toEqual({ endDay: MON, endMin: 18 * 60 });
  });

  it('跨日(週一 10:00 + 11h → 週二 13:00,day2 從 10:00 起)', () => {
    expect(deriveEnd(MON, 10 * 60, 11, avail, settings)).toEqual({ endDay: TUE, endMin: 13 * 60 });
  });

  it('跨週末(週五 10:00 + 11h → 下週一 13:00)', () => {
    expect(deriveEnd(FRI, 10 * 60, 11, avail, settings)).toEqual({ endDay: NEXT_MON, endMin: 13 * 60 });
  });

  it('0 工時 → 結束等於開始', () => {
    expect(deriveEnd(MON, 10 * 60, 0, avail, settings)).toEqual({ endDay: MON, endMin: 10 * 60 });
  });
});

describe('workingHoursBetween: 結束 → 工時(deriveEnd 的反函式)', () => {
  it('同一天 = 時鐘差', () => {
    expect(workingHoursBetween(MON, 10 * 60, MON, 14 * 60, avail, settings)).toBe(4);
  });

  it('跨日 = 首日鋪滿 + 末日從 10:00 起', () => {
    expect(workingHoursBetween(MON, 10 * 60, TUE, 13 * 60, avail, settings)).toBe(11);
  });

  it('跨週末只算工作日', () => {
    expect(workingHoursBetween(FRI, 10 * 60, NEXT_MON, 13 * 60, avail, settings)).toBe(11);
  });

  it('結束早於開始 → 0', () => {
    expect(workingHoursBetween(MON, 14 * 60, MON, 10 * 60, avail, settings)).toBe(0);
    expect(workingHoursBetween(TUE, 10 * 60, MON, 10 * 60, avail, settings)).toBe(0);
  });

  it('往返一致:deriveEnd 後再 workingHoursBetween 還原工時', () => {
    for (const [startMin, hours] of [[10 * 60, 4], [14 * 60, 6], [10 * 60, 11], [11 * 60, 20]]) {
      const { endDay, endMin } = deriveEnd(MON, startMin, hours, avail, settings);
      expect(workingHoursBetween(MON, startMin, endDay, endMin, avail, settings)).toBe(hours);
    }
  });
});

describe('layoutSingleTask: startOffsetHours 只套用第一天', () => {
  it('第一天 o = 指定位移,後續天回到 o=0', () => {
    // 週一 14:00 起(o=4)、11 工時:day1 Mon 8h@o4、day2 Tue 3h@o0。
    const entry = layoutSingleTask(new Date(MON + 'T00:00:00'), 11, 0, settings, avail, 4);
    expect(entry.days[MON]).toEqual({ h: 8, o: 4 });
    expect(entry.days[TUE]).toEqual({ h: 3, o: 0 });
    expect(entry.start).toBe(MON);
    expect(entry.end).toBe(TUE);
  });

  it('省略 startOffsetHours → 第一天 o=0(改版前行為)', () => {
    const entry = layoutSingleTask(new Date(MON + 'T00:00:00'), 4, 0, settings, avail);
    expect(entry.days[MON]).toEqual({ h: 4, o: 0 });
  });
});
