import { describe, it, expect, beforeAll } from 'vitest';
import { runScheduleV2, mkTasks } from '../schedulerV2.js';
import { fmtF, aWD, addD, nWD, sWD } from '../dateUtils.js';
import { BT } from '../tasks.js';

const settings = { hoursPerDay: 8, blackouts: [] };
const START = '2026-05-19';

const scenarios = [
  { label: 'tight', surveyStart: '2026-06-29', campaignStart: '2026-08-03' },
  { label: 'loose', surveyStart: '2026-07-06', campaignStart: '2026-08-17' },
];

const p2Scenarios = {
  startDate: "2026-05-23",
  surveyStart: "2026-06-23",
  campaignStart: "2026-08-13",
  campaignEnd: "2026-10-14"
};

// proj: 永遠輸出 BT 所有任務，符合實際使用情境
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

// ── mkTasks ───────────────────────────────────────────────────────────────────

describe('mkTasks', () => {
  it('returns one entry per BT task with id and enabled fields', () => {
    const tasks = mkTasks('full');
    expect(tasks).toHaveLength(BT.length);
    tasks.forEach((t) => {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('enabled');
    });
  });

  it('full template enables all tasks', () => {
    expect(mkTasks('full').every((t) => t.enabled)).toBe(true);
  });

  it('pm template: task with pm>0 is enabled', () => {
    // 1B.1 has pm=0.5 → should be enabled
    const map = Object.fromEntries(mkTasks('pm').map((t) => [t.id, t]));
    expect(map['1B.1'].enabled).toBe(true);
  });

  it('pm template: 0h task with pm=0 is enabled (h===0 clause)', () => {
    // 2.19: h=0, pm=0, w=0 → enabled via h===0
    const map = Object.fromEntries(mkTasks('pm').map((t) => [t.id, t]));
    expect(map['2.19'].enabled).toBe(true);
  });
});

// ── Basic scheduling ──────────────────────────────────────────────────────────

describe('basic scheduling', () => {
  it.each(scenarios)('1B.1 (no deps) starts on projStart [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    expect(fmtF(sch['p']['1B.1'].start)).toBe(START);
  });

  it('startDate on weekend advances to next working day', () => {
    // 2026-05-17 is Sunday → advances to Monday 2026-05-18
    const p = proj('p', '2026-05-17');
    const { sch } = runScheduleV2([p], settings);
    expect(fmtF(sch['p']['1B.1'].start)).toBe('2026-05-18');
  });

  it('startDate inside blackout advances past blackout', () => {
    // Block Tue–Fri; projStart advances to following Monday 2026-05-25
    const bl = [{ start: START, end: '2026-05-22' }];
    const p = proj('p', START);
    const { sch } = runScheduleV2([p], { ...settings, blackouts: bl });
    expect(fmtF(sch['p']['1B.1'].start)).toBe('2026-05-25');
  });

  it('project with no valid startDate is skipped', () => {
    const p = proj('p', '');
    const { sch, miles } = runScheduleV2([p], settings);
    expect(sch['p']).toEqual({});
    expect(miles['p']).toEqual({});
  });

  it('no projects returns empty result', () => {
    const { sch, miles } = runScheduleV2([], settings);
    expect(Object.keys(sch)).toHaveLength(0);
    expect(Object.keys(miles)).toHaveLength(0);
  });

  it.each(scenarios)('all BT tasks are scheduled [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    expect(Object.keys(sch['p'])).toHaveLength(BT.length);
  });
});

// ── 0-hour tasks ──────────────────────────────────────────────────────────────

describe('0-hour tasks', () => {
  it.each(scenarios)('1B.2 (0h, depends on 1B.1) is scheduled with start === end [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t = sch['p']['1B.2'];
    expect(t).toBeDefined();
    expect(fmtF(t.start)).toBe(fmtF(t.end));
  });

  it.each(scenarios)('5.3 (0h) anchors downstream: 5.4 starts on or after 5.3.end [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t53 = sch['p']['5.3'];
    const t54 = sch['p']['5.4'];
    expect(t54.start >= t53.end).toBe(true);
  });
});

// ── Wait periods ──────────────────────────────────────────────────────────────

describe('wait periods', () => {
  it.each(scenarios)('1B.1 (w=2): waitEnd is end + 2 working days [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t = sch['p']['1B.1'];
    expect(fmtF(t.waitEnd)).toBe(fmtF(aWD(t.end, 2, [])));
  });

  it.each(scenarios)('1B.4 starts the next working day after 1B.1.waitEnd [$label]', ({ surveyStart, campaignStart }) => {
    // 1B.4 depends on 1B.1; must start nWD(1B.1.waitEnd + 1)
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t1 = sch['p']['1B.1'];
    const t4 = sch['p']['1B.4'];
    expect(t4.start >= nWD(addD(t1.waitEnd, 1), [])).toBe(true);
  });

  it.each(scenarios)("1B.4 is not blocked by 1B.3's wait period (siblings) [$label]", ({ surveyStart, campaignStart }) => {
    // 1B.3 (w=7) and 1B.4 (w=0) both depend on 1B.1, but not on each other.
    // 1B.4 must start before 1B.3.waitEnd
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t3 = sch['p']['1B.3'];
    const t4 = sch['p']['1B.4'];
    expect(t4.start < t3.waitEnd).toBe(true);
  });

  it.each(scenarios)('1B.4 (w=0) has null waitEnd [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    expect(sch['p']['1B.4'].waitEnd).toBeNull();
  });
});

// ── Dependencies ──────────────────────────────────────────────────────────────

describe('dependencies', () => {
  it.each(scenarios)('1B.3 starts on or after 1B.1.waitEnd [$label]', ({ surveyStart, campaignStart }) => {
    // 1B.1 (h=0.5, w=2) → 1B.3 (h=0.5, w=7, depends on 1B.1)
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t1 = sch['p']['1B.1'];
    const t3 = sch['p']['1B.3'];
    expect(t3.start >= t1.waitEnd).toBe(true);
    expect(fmtF(t3.waitEnd)).toBe(fmtF(aWD(t3.end, 7, [])));
  });

  it.each(scenarios)('2.9 waits for latest dep effective end (2.8.waitEnd vs 2.6.end) [$label]', ({ surveyStart, campaignStart }) => {
    // 2.9 depends on both 2.8 (h=0, w=3) and 2.6.
    // 2.9 must start on or after max(2.8.waitEnd, 2.6.end).
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t8 = sch['p']['2.8'];
    const t6 = sch['p']['2.6'];
    const t9 = sch['p']['2.9'];
    const latestDep = t8.waitEnd > t6.end ? t8.waitEnd : t6.end;
    expect(t9.start >= latestDep).toBe(true);
  });
});

// ── Capacity sharing ──────────────────────────────────────────────────────────

describe('capacity sharing across projects', () => {
  it('result is independent of project array order', () => {
    const p1 = proj('p1', START,       { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const p2 = proj("p2", p2Scenarios.startDate, {
      surveyStart: p2Scenarios.surveyStart,
      campaignStart: p2Scenarios.campaignStart,
    });
    const { sch: schFwd } = runScheduleV2([p1, p2], settings);
    const { sch: schRev } = runScheduleV2([p2, p1], settings);
    for (const id of Object.keys(schFwd['p2'])) {
      expect(fmtF(schFwd['p2'][id].start)).toBe(fmtF(schRev['p2'][id].start));
    }
  });
});

// ── Hard deadline priority ────────────────────────────────────────────────────

describe('hard deadline priority', () => {
  it('earlier-deadline project gets capacity before later-deadline project', () => {
    // p1 (surveyStart Jul 6) has earlier deadline than p2 (surveyStart Jul 16) → higher priority.
    // p1's 1B.1 should finish no later than p2's.
    const p1 = proj('p1', START,       { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const p2 = proj("p2", p2Scenarios.startDate, {
      surveyStart: p2Scenarios.surveyStart,
      campaignStart: p2Scenarios.campaignStart,
    });
    const { sch } = runScheduleV2([p1, p2], settings);
    expect(sch['p1']['1B.1'].end <= sch['p2']['1B.1'].end).toBe(true);
  });
});

// ── Milestones ────────────────────────────────────────────────────────────────

describe('milestones', () => {
  it.each(scenarios)('eSv equals nWD(lastSvEnd + 1) [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch, miles } = runScheduleV2([p], settings);
    const svEnds = Object.values(sch['p'])
      .filter((t) => t.dl === 'sv')
      .map((t) => t.end);
    const lastEnd = new Date(Math.max(...svEnds.map((d) => d.getTime())));
    const expectedESv = nWD(addD(lastEnd, 1), []);
    expect(fmtF(miles['p'].eSv)).toBe(fmtF(expectedESv));
  });

  it.each(scenarios)('eCp is set when campaignStart is provided [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { miles } = runScheduleV2([p], settings);
    expect(miles['p'].eCp).not.toBeNull();
  });

  it('calcStart reflects projStart (after weekend advance)', () => {
    // Sunday 2026-05-17 → advances to Monday 2026-05-18
    const p = proj('p', '2026-05-17');
    const { miles } = runScheduleV2([p], settings);
    expect(fmtF(miles['p'].calcStart)).toBe('2026-05-18');
  });
});

// ── Phase 3 / 4A parallel after survey launch ─────────────────────────────────

describe('phase 3 & 4A parallel after survey launch', () => {
  it.each(scenarios)('3.1 starts after 2.19 completes [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t219 = sch['p']['2.19'];
    const t31  = sch['p']['3.1'];
    expect(t219).toBeDefined();
    expect(t31.start >= t219.end).toBe(true);
  });

  it.each(scenarios)('4A.1 starts after 2.19 completes [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t219 = sch['p']['2.19'];
    const t4a1 = sch['p']['4A.1'];
    expect(t4a1.start >= t219.end).toBe(true);
  });

  it.each(scenarios)('3.1 and 4A.1 start on the same day (parallel) [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    expect(fmtF(sch['p']['3.1'].start)).toBe(fmtF(sch['p']['4A.1'].start));
  });

  it.each(scenarios)('2.20 starts at least 30 calendar days after 2.19 [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t219 = sch['p']['2.19'];
    const t220 = sch['p']['2.20'];
    expect(t219).toBeDefined();
    expect(t220).toBeDefined();
    expect(t220.start >= addD(t219.end, 30)).toBe(true);
  });

  it.each(scenarios)('2.20 end is before campaignStart [$label]', ({ surveyStart, campaignStart }) => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t220 = sch['p']['2.20'];
    expect(t220).toBeDefined();
    const cp = new Date(campaignStart + "T00:00:00");
    expect(t220.end < cp).toBe(true);
  });
});

// ── Phase 5（廣告投放）pre10 deadline ─────────────────────────────────────────

describe.each(scenarios)('Phase 5（廣告投放）pre10 deadline [$label]', ({ surveyStart, campaignStart }) => {
  it('5.6 finishes on or before campaignStart − 10 working days', () => {
    const pre10Deadline = sWD(
      new Date(campaignStart + "T00:00:00"),
      10,
      [],
    );
    
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t56 = sch['p']['5.6'];
    expect(t56).toBeDefined();
    expect(t56.end <= pre10Deadline).toBe(true);
  });

  it('5.x tasks carry dl="pre10" in scheduled records', () => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    expect(sch['p']['5.1'].dl).toBe('pre10');
    expect(sch['p']['5.6'].dl).toBe('pre10');
  });

  it('eCp is set when campaignStart is provided (pre10 tasks included)', () => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { miles } = runScheduleV2([p], settings);
    expect(miles['p'].eCp).not.toBeNull();
  });

  it('campaignStart unset: pre10 tasks still schedule alongside all other tasks', () => {
    const p = proj('p', START, { surveyStart });
    const { sch } = runScheduleV2([p], settings);
    expect(sch['p']['5.6']).toBeDefined();
    expect(Object.keys(sch['p'])).toHaveLength(BT.length);
  });
});

// ── Phase 7 固定貼文日 ────────────────────────────────────────────────────────

describe.each(scenarios)('Phase 7 pinned posting tasks [$label]', ({ surveyStart, campaignStart }) => {
  const cp = new Date(campaignStart + 'T00:00:00');

  it('7.3 is scheduled on campaignStart − 7 calendar days', () => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const expected = addD(cp, -7);
    expect(fmtF(sch['p']['7.3'].start)).toBe(fmtF(expected));
  });

  it('7.5 is scheduled on campaignStart − 3 calendar days', () => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const expected = addD(cp, -3);
    expect(fmtF(sch['p']['7.5'].start)).toBe(fmtF(expected));
  });

  it('7.7 is scheduled on campaignStart − 1 calendar day', () => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const expected = addD(cp, -1);
    
    expect(fmtF(sch['p']['7.7'].start)).toBe(fmtF(expected));
  });

  it('7.2 finishes on or before 3 working days before 7.3', () => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t72 = sch['p']['7.2'];
    const t73 = sch['p']['7.3'];
    expect(t72.end <= sWD(t73.start, 3, [])).toBe(true);
  });

  it('7.4 finishes on or before 3 working days before 7.5', () => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t74 = sch['p']['7.4'];
    const t75 = sch['p']['7.5'];
    expect(t74.end <= sWD(t75.start, 3, [])).toBe(true);
  });

  it('7.6 finishes on or before 3 working days before 7.7', () => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    const t76 = sch['p']['7.6'];
    const t77 = sch['p']['7.7'];
    expect(t76.end <= sWD(t77.start, 3, [])).toBe(true);
  });

  it('7.3 record carries tm="pre7"', () => {
    const p = proj('p', START, { surveyStart, campaignStart });
    const { sch } = runScheduleV2([p], settings);
    expect(sch['p']['7.3'].tm).toBe('pre7');
  });
});

// ── Phase 7 開賣後固定貼文日（7.9–7.20）─────────────────────────────────────

const cpEndDate = '2026-10-03';

describe.each(scenarios)('Phase 7 post-launch pinned tasks [$label]', ({ surveyStart, campaignStart }) => {
  const cp = new Date(campaignStart + 'T00:00:00');
  const ce = new Date(cpEndDate + 'T00:00:00');

  function mkProj(id) {
    return proj(id, START, { surveyStart, campaignStart, campaignEnd: cpEndDate });
  }

  it('7.8 is scheduled on campaignStart (dcp0)', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(fmtF(sch['p']['7.8'].start)).toBe(fmtF(cp));
  });

  it('7.10 is scheduled on campaignStart', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(fmtF(sch['p']['7.10'].start)).toBe(fmtF(cp));
  });

  it('7.12 is scheduled on campaignStart + 1 calendar day', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(fmtF(sch['p']['7.12'].start)).toBe(fmtF(addD(cp, 1)));
  });

  it('7.14 is scheduled on campaignStart + 23 calendar days', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(fmtF(sch['p']['7.14'].start)).toBe(fmtF(addD(cp, 23)));
  });

  it('7.16 is scheduled on campaignStart + 30 calendar days', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(fmtF(sch['p']['7.16'].start)).toBe(fmtF(addD(cp, 30)));
  });

  it('7.18 is scheduled on campaignEnd − 7 calendar days', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(fmtF(sch['p']['7.18'].start)).toBe(fmtF(addD(ce, -7)));
  });

  it('7.20 is scheduled on campaignEnd + 1 calendar day', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(fmtF(sch['p']['7.20'].start)).toBe(fmtF(addD(ce, 1)));
  });

  it('7.9 finishes on or before 3 working days before campaignStart', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(sch['p']['7.9'].end <= sWD(cp, 3, [])).toBe(true);
  });

  it('7.11 finishes on or before 3 working days before campaignStart + 1', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(sch['p']['7.11'].end <= sWD(addD(cp, 1), 3, [])).toBe(true);
  });

  it('7.13 finishes on or before 3 working days before campaignStart + 23', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(sch['p']['7.13'].end <= sWD(addD(cp, 23), 3, [])).toBe(true);
  });

  it('7.15 finishes on or before 3 working days before campaignStart + 30', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(sch['p']['7.15'].end <= sWD(addD(cp, 30), 3, [])).toBe(true);
  });

  it('7.17 finishes on or before 3 working days before campaignEnd − 7', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(sch['p']['7.17'].end <= sWD(addD(ce, -7), 3, [])).toBe(true);
  });

  it('7.19 finishes on or before 3 working days before campaignEnd + 1', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(sch['p']['7.19'].end <= sWD(addD(ce, 1), 3, [])).toBe(true);
  });

  it('7.10 record carries tm="dcp0"', () => {
    const { sch } = runScheduleV2([mkProj('p')], settings);
    expect(sch['p']['7.10'].tm).toBe('dcp0');
  });
});

// ── 整合測試：兩個完整專案（BT 所有任務）────────────────────────────────────

describe('full-project integration (two projects, all BT tasks)', () => {
  const p1 = proj('p1', START,       { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
  const p2 = proj("p2", p2Scenarios.startDate, {
    surveyStart: p2Scenarios.surveyStart,
    campaignStart: p2Scenarios.campaignStart,
  });

  it('both projects schedule all BT tasks', () => {
    const { sch } = runScheduleV2([p1, p2], settings);
    expect(Object.keys(sch['p1'])).toHaveLength(BT.length);
    expect(Object.keys(sch['p2'])).toHaveLength(BT.length);
  });

  it('both projects produce eSv and eCp milestones', () => {
    const { miles } = runScheduleV2([p1, p2], settings);
    expect(miles['p1'].eSv).not.toBeNull();
    expect(miles['p1'].eCp).not.toBeNull();
    expect(miles['p2'].eSv).not.toBeNull();
    expect(miles['p2'].eCp).not.toBeNull();
  });

  it('p1 eSv is no later than p2 eSv (p1 has earlier surveyStart)', () => {
    const { miles } = runScheduleV2([p1, p2], settings);
    expect(miles['p1'].eSv <= miles['p2'].eSv).toBe(true);
  });

  it('result is stable regardless of project array order', () => {
    const { sch: fwd } = runScheduleV2([p1, p2], settings);
    const { sch: rev } = runScheduleV2([p2, p1], settings);
    for (const id of Object.keys(fwd['p2'])) {
      expect(fmtF(fwd['p2'][id].start)).toBe(fmtF(rev['p2'][id].start));
    }
  });
});

// ── 2.2 pinnedWait：延長等待期，下游任務跟著延後 ─────────────────────────────

describe('pinnedWait on 2.2 delays downstream tasks', () => {
  const PINNED_WAIT = 5; // override default w=2

  function projWithPin(id) {
    return {
      id, name: id, template: 'full',
      startDate: START,
      surveyStart: '2026-07-06', campaignStart: '2026-08-17',
      tasks: BT.map((bt) => ({
        id: bt.id, enabled: true,
        ...(bt.id === '2.2' ? { pinnedWait: PINNED_WAIT } : {}),
      })),
    };
  }

  it('2.2 waitEnd = end + 5 working days', () => {
    const { sch } = runScheduleV2([projWithPin('p')], settings);
    const t = sch['p']['2.2'];
    expect(fmtF(t.waitEnd)).toBe(fmtF(aWD(t.end, PINNED_WAIT, [])));
  });

  it('2.3 starts on nWD(2.2.waitEnd + 1)', () => {
    const { sch } = runScheduleV2([projWithPin('p')], settings);
    const t22 = sch['p']['2.2'];
    const t23 = sch['p']['2.3'];
    const expectedStart = nWD(addD(t22.waitEnd, 1), []);
    expect(fmtF(t23.start)).toBe(fmtF(expectedStart));
  });

  it('2.3 starts later than with default w=2', () => {
    const pBase   = proj('base', START, { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const pPinned = projWithPin('pin');
    const { sch: base } = runScheduleV2([pBase],   settings);
    const { sch: pin  } = runScheduleV2([pPinned], settings);
    expect(pin['pin']['2.3'].start > base['base']['2.3'].start).toBe(true);
  });

  it('2.3 start is exactly 3 working days later than default (5 - 2 = 3 extra wait days)', () => {
    const pBase   = proj('base', START, { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const pPinned = projWithPin('pin');
    const { sch: base } = runScheduleV2([pBase],   settings);
    const { sch: pin  } = runScheduleV2([pPinned], settings);
    const expectedStart = nWD(addD(aWD(base['base']['2.2'].end, PINNED_WAIT, []), 1), []);
    expect(fmtF(pin['pin']['2.3'].start)).toBe(fmtF(expectedStart));
  });
});

// ── 2.2 pinnedStart：固定開始日期，任務不得早於指定日 ────────────────────────

describe('pinnedStart on 2.2 delays task start', () => {
  // 2.2 naturally starts on 2026-05-28 (nWD after 2.1.waitEnd=May 27)
  // We pin it to 7 working days later = 2026-06-08
  const NATURAL_START = '2026-05-28';
  const PINNED_START  = '2026-06-08'; // aWD(2026-05-28, 7)

  function projWithPinnedStart(id) {
    return {
      id, name: id, template: 'full',
      startDate: START,
      surveyStart: '2026-07-06', campaignStart: '2026-08-17',
      tasks: BT.map((bt) => ({
        id: bt.id, enabled: true,
        ...(bt.id === '2.2' ? { pinnedStart: PINNED_START } : {}),
      })),
    };
  }

  it('without pinnedStart, 2.2 starts on its natural date (2026-05-28)', () => {
    const p = proj('p', START, { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const { sch } = runScheduleV2([p], settings);
    expect(fmtF(sch['p']['2.2'].start)).toBe(NATURAL_START);
  });

  it('with pinnedStart=2026-06-08, 2.2 should start on 2026-06-08 (7 wd later)', () => {
    const { sch } = runScheduleV2([projWithPinnedStart('p')], settings);
    expect(fmtF(sch['p']['2.2'].start)).toBe(PINNED_START);
  });

  it('2.3 starts on nWD(2.2.waitEnd + 1) with pinnedStart', () => {
    const { sch } = runScheduleV2([projWithPinnedStart('p')], settings);
    const t22 = sch['p']['2.2'];
    const t23 = sch['p']['2.3'];
    expect(fmtF(t23.start)).toBe(fmtF(nWD(addD(t22.waitEnd, 1), [])));
  });

  it('cascade: 2.4 (dep 2.3) starts later when 2.2 is pinned', () => {
    const pBase = proj('base', START, { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const pPin  = projWithPinnedStart('pin');
    const { sch: base } = runScheduleV2([pBase], settings);
    const { sch: pin  } = runScheduleV2([pPin],  settings);
    expect(pin['pin']['2.4'].start > base['base']['2.4'].start).toBe(true);
  });

  it('cascade: 2.4 starts on or after 2.3.end', () => {
    const { sch } = runScheduleV2([projWithPinnedStart('p')], settings);
    expect(sch['p']['2.4'].start >= sch['p']['2.3'].end).toBe(true);
  });

  it('deep cascade: 2.9 (dep chain 2.2→2.3→2.4→2.5→2.8→2.9) starts later when 2.2 is pinned', () => {
    const pBase = proj('base', START, { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const pPin  = projWithPinnedStart('pin');
    const { sch: base } = runScheduleV2([pBase], settings);
    const { sch: pin  } = runScheduleV2([pPin],  settings);
    expect(pin['pin']['2.9'].start > base['base']['2.9'].start).toBe(true);
  });
});

// ── pinnedStart 往回移動：取消或提前 pin，任務及下游都跟著回來 ────────────────

describe('pinnedStart move-back: task and downstream recover when pin is removed or moved earlier', () => {
  const SVY = '2026-07-06';
  const CPS = '2026-08-17';

  // 2.2 natural start = 2026-05-28
  const FORWARD_PIN = '2026-06-05'; // pin 往後
  const BACKWARD_PIN = '2026-05-29'; // pin 往前（比 FORWARD_PIN 早，但比自然日晚 1 天）

  function mkProj(id, pin2_2) {
    return {
      id, name: id, template: 'full',
      startDate: START, surveyStart: SVY, campaignStart: CPS,
      tasks: BT.map((bt) => ({
        id: bt.id, enabled: true,
        ...(bt.id === '2.2' && pin2_2 ? { pinnedStart: pin2_2 } : {}),
      })),
    };
  }

  it('前置任務 2.1 不受 pinnedStart 影響', () => {
    const { sch: noPin  } = runScheduleV2([mkProj('a', null)],        settings);
    const { sch: fwdPin } = runScheduleV2([mkProj('b', FORWARD_PIN)], settings);
    expect(fmtF(fwdPin['b']['2.1'].start)).toBe(fmtF(noPin['a']['2.1'].start));
  });

  it('把 pin 從 2026-06-05 往回移到 2026-05-29：2.2 跟著提前', () => {
    const { sch: fwd } = runScheduleV2([mkProj('a', FORWARD_PIN)],  settings);
    const { sch: bwd } = runScheduleV2([mkProj('b', BACKWARD_PIN)], settings);
    expect(bwd['b']['2.2'].start < fwd['a']['2.2'].start).toBe(true);
    expect(fmtF(bwd['b']['2.2'].start)).toBe(BACKWARD_PIN);
  });

  it('移除 pin：2.2 回到自然開始日 2026-05-28', () => {
    const { sch: fwd  } = runScheduleV2([mkProj('a', FORWARD_PIN)], settings);
    const { sch: none } = runScheduleV2([mkProj('b', null)],         settings);
    expect(none['b']['2.2'].start < fwd['a']['2.2'].start).toBe(true);
    expect(fmtF(none['b']['2.2'].start)).toBe('2026-05-28');
  });

  it('pin 往回後，下游 2.3 也跟著提前（cascade 恢復）', () => {
    const { sch: fwd } = runScheduleV2([mkProj('a', FORWARD_PIN)],  settings);
    const { sch: bwd } = runScheduleV2([mkProj('b', BACKWARD_PIN)], settings);
    expect(bwd['b']['2.3'].start < fwd['a']['2.3'].start).toBe(true);
  });

  it('移除 pin 後，深層下游 2.9 也跟著提前（deep cascade 恢復）', () => {
    const { sch: fwd  } = runScheduleV2([mkProj('a', FORWARD_PIN)], settings);
    const { sch: none } = runScheduleV2([mkProj('b', null)],         settings);
    expect(none['b']['2.9'].start < fwd['a']['2.9'].start).toBe(true);
  });
});

// ── ns（不拆分優先）─────────────────────────────────────────────────────────

describe('ns（不拆分優先）', () => {
  it('2.2 在排程記錄中帶有 ns=true', () => {
    const p = proj('p', START, { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const { sch } = runScheduleV2([p], settings);
    expect(sch['p']['2.2'].ns).toBe(true);
  });

  it('2.4 在排程記錄中帶有 ns=true', () => {
    const p = proj('p', START, { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const { sch } = runScheduleV2([p], settings);
    expect(sch['p']['2.4'].ns).toBe(true);
  });

  it('ns 任務（2.4, h=1）與非 ns 任務同日競爭時，ns 任務先完成', () => {
    // 2.4 (h=1, ns=true) 依賴 2.3；2.3 完成後 2.4 和其他任務競爭同一天工時
    // ns 任務應當天取得所有所需工時，start === end
    const p = proj('p', START, { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const { sch } = runScheduleV2([p], settings);
    const t24 = sch['p']['2.4'];
    expect(t24).toBeDefined();
    expect(fmtF(t24.start)).toBe(fmtF(t24.end));
  });

  it('兩個專案共享工時時，ns 任務仍在同一天完成', () => {
    const p1 = proj('p1', START, { surveyStart: '2026-07-06', campaignStart: '2026-08-17' });
    const p2 = proj('p2', p2Scenarios.startDate, {
      surveyStart: p2Scenarios.surveyStart,
      campaignStart: p2Scenarios.campaignStart,
    });
    const { sch } = runScheduleV2([p1, p2], settings);
    const t24 = sch['p1']['2.4'];
    expect(t24).toBeDefined();
    expect(fmtF(t24.start)).toBe(fmtF(t24.end));
  });
});

// ── 雙專案 7.2–7.20 發文日驗證（共享工時下日期仍正確）───────────────────────

describe('two-project 7.2–7.20 pinned dates under shared capacity', () => {
  // 兩個專案各有不同的 campaignStart / campaignEnd
  const cfg = {
    p1: { startDate: START,  ...scenarios[1], campaignEnd: '2026-10-03' },
    p2: { ...p2Scenarios },
  };

  const p1 = proj('p1', cfg.p1.startDate, { surveyStart: cfg.p1.surveyStart, campaignStart: cfg.p1.campaignStart, campaignEnd: cfg.p1.campaignEnd });
  const p2 = proj('p2', cfg.p2.startDate, { surveyStart: cfg.p2.surveyStart, campaignStart: cfg.p2.campaignStart, campaignEnd: cfg.p2.campaignEnd });

  let sch;
  beforeAll(() => { ({ sch } = runScheduleV2([p1, p2], settings)); });

  // ── helper: for each project check pinned posting date and manufacturing deadline
  function checkPinAndDeadline(pid, postId, makeId, expectedDate) {
    it(`[${pid}] ${postId} is scheduled on ${fmtF(expectedDate)}`, () => {
      expect(fmtF(sch[pid][postId].start)).toBe(fmtF(expectedDate));
    });
    it(`[${pid}] ${makeId} finishes on or before 3 wd before ${postId}`, () => {
      expect(sch[pid][makeId].end <= sWD(expectedDate, 3, [])).toBe(true);
    });
  }

  for (const [pid, c] of Object.entries(cfg)) {
    const cp = new Date(c.campaignStart + 'T00:00:00');
    const ce = new Date(c.campaignEnd   + 'T00:00:00');

    // 7.2–7.7 (活動上線前)
    it(`[${pid}] 7.3 is on campaignStart − 7 days`, () => {
      expect(fmtF(sch[pid]['7.3'].start)).toBe(fmtF(addD(cp, -7)));
    });
    it(`[${pid}] 7.2 finishes ≤ 3 wd before 7.3`, () => {
      expect(sch[pid]['7.2'].end <= sWD(addD(cp, -7), 3, [])).toBe(true);
    });
    it(`[${pid}] 7.5 is on campaignStart − 3 days`, () => {
      expect(fmtF(sch[pid]['7.5'].start)).toBe(fmtF(addD(cp, -3)));
    });
    it(`[${pid}] 7.4 finishes ≤ 3 wd before 7.5`, () => {
      expect(sch[pid]['7.4'].end <= sWD(addD(cp, -3), 3, [])).toBe(true);
    });
    it(`[${pid}] 7.7 is on campaignStart − 1 day`, () => {
      expect(fmtF(sch[pid]['7.7'].start)).toBe(fmtF(addD(cp, -1)));
    });
    it(`[${pid}] 7.6 finishes ≤ 3 wd before 7.7`, () => {
      expect(sch[pid]['7.6'].end <= sWD(addD(cp, -1), 3, [])).toBe(true);
    });

    // 7.8–7.20 (活動上線當天及之後)
    it(`[${pid}] 7.8 is on campaignStart`, () => {
      expect(fmtF(sch[pid]['7.8'].start)).toBe(fmtF(cp));
    });
    checkPinAndDeadline(pid, '7.10', '7.9',  cp);
    checkPinAndDeadline(pid, '7.12', '7.11', addD(cp, 1));
    checkPinAndDeadline(pid, '7.14', '7.13', addD(cp, 23));
    checkPinAndDeadline(pid, '7.16', '7.15', addD(cp, 30));
    checkPinAndDeadline(pid, '7.18', '7.17', addD(ce, -7));
    checkPinAndDeadline(pid, '7.20', '7.19', addD(ce, 1));
  }
});
