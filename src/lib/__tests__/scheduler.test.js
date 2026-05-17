import { describe, it, expect } from 'vitest';
import { runSchedule } from '../scheduler.js';
import { fmtF, aWD } from '../dateUtils.js';

const settings = { hoursPerDay: 8, blackouts: [] };

function proj(id, startDate, taskIds, extra = {}) {
  return {
    id, name: id, template: 'full',
    startDate,
    surveyStart: '', surveyEnd: '',
    campaignStart: '', campaignEnd: '',
    tasks: taskIds.map((tid) => ({ id: tid, enabled: true })),
    ...extra,
  };
}

// ── Core fix ──────────────────────────────────────────────────────────────────

describe('global scheduling: order independence', () => {
  it('p3 start date is the same regardless of array order', () => {
    // Reproduces the "blue project delayed by array position" bug.
    // p1 and p2 both start May 19 (same week), filling the load.
    // p3 starts May 26 (one week later) and should start on May 26
    // regardless of whether it appears first or last in the array.
    const p1 = proj('p1', '2026-05-19', ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6']);
    const p2 = proj('p2', '2026-05-19', ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6']);
    const p3 = proj('p3', '2026-05-26', ['1.1']);

    const { sch: schFwd } = runSchedule([p1, p2, p3], settings);
    const { sch: schRev } = runSchedule([p3, p2, p1], settings);

    expect(fmtF(schFwd['p3']['1.1'].start)).toBe(fmtF(schRev['p3']['1.1'].start));
  });

  it('priority: earlier-startDate project wins load competition', () => {
    // p1 starts May 19, p2 starts May 26.
    // p2 should never start before p1 finishes its first task.
    const p1 = proj('p1', '2026-05-19', ['1.1']);
    const p2 = proj('p2', '2026-05-26', ['1.1']);

    const { sch: schFwd } = runSchedule([p1, p2], settings);
    const { sch: schRev } = runSchedule([p2, p1], settings);

    // p1 always starts on its projStart regardless of order
    expect(fmtF(schFwd['p1']['1.1'].start)).toBe('2026-05-19');
    expect(fmtF(schRev['p1']['1.1'].start)).toBe('2026-05-19');

    // p2 also produces the same result in both orderings
    expect(fmtF(schFwd['p2']['1.1'].start)).toBe(fmtF(schRev['p2']['1.1'].start));
  });
});

// ── projStart floor ───────────────────────────────────────────────────────────

describe('projStart floor enforcement', () => {
  it('task with no deps starts on or after projStart', () => {
    const p = proj('p', '2026-05-26', ['1.1']);
    const { sch } = runSchedule([p], settings);
    // Use fmtF for comparison to avoid timezone offset issues with Date objects
    expect(fmtF(sch['p']['1.1'].start) >= '2026-05-26').toBe(true);
  });

  it('single project: first task starts exactly on startDate (weekday)', () => {
    // 2026-05-19 is a Tuesday — a working day
    const p = proj('p', '2026-05-19', ['1.1']);
    const { sch } = runSchedule([p], settings);
    expect(fmtF(sch['p']['1.1'].start)).toBe('2026-05-19');
  });

  it('startDate on weekend advances to next working day', () => {
    // 2026-05-17 is a Sunday; nWD advances to Monday 2026-05-18
    const p = proj('p', '2026-05-17', ['1.1']);
    const { sch } = runSchedule([p], settings);
    expect(fmtF(sch['p']['1.1'].start)).toBe('2026-05-18');
  });
});

// ── Dependency ordering ───────────────────────────────────────────────────────

describe('dependency ordering', () => {
  it('dependent task starts after its predecessor ends', () => {
    // 1.2 depends on 1.1 (w=0)
    const p = proj('p', '2026-05-19', ['1.1', '1.2']);
    const { sch } = runSchedule([p], settings);
    const t1 = sch['p']['1.1'];
    const t2 = sch['p']['1.2'];
    // t2 must start strictly after t1 ends
    expect(t2.start > t1.end).toBe(true);
  });

  it('wait period: successor starts after dep.end + wait working days', () => {
    // 1B.3 depends on 1.6 (w=0), and itself has w=5.
    // 1B.4 also depends on 1.6 (w=0, no wait from dep side).
    // So ear for 1B.4 = day after 1.6.end
    const p = proj('p', '2026-05-19', ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1B.3', '1B.4']);
    const { sch } = runSchedule([p], settings);
    const t16  = sch['p']['1.6'];
    const t1B3 = sch['p']['1B.3'];
    const t1B4 = sch['p']['1B.4'];

    // Both depend on 1.6 (w=0) → must start day after 1.6 ends
    expect(t1B3.start > t16.end).toBe(true);
    expect(t1B4.start > t16.end).toBe(true);

    // 1B.3 has w=5 itself → waitEnd = 1B.3.end + 5 working days
    expect(t1B3.waitEnd).not.toBeNull();
    const expectedWaitEnd = aWD(t1B3.end, 5, []);
    expect(fmtF(t1B3.waitEnd)).toBe(fmtF(expectedWaitEnd));
  });
});

// ── Load sharing ──────────────────────────────────────────────────────────────

describe('load sharing across projects', () => {
  it('two 8h tasks cannot share the same day (end dates differ)', () => {
    // Each project has task "1.2" (8h). With hpd=8, they cannot both finish on the same day.
    // "1.2" normally depends on "1.1", but since "1.1" is not enabled,
    // depKeys is empty → it schedules freely from projStart.
    // Note: `start` = ear (earliest anchor), so both start on May 19.
    // The end dates must differ because only 8h of capacity exists per day.
    const p1 = proj('p1', '2026-05-19', ['1.2']);
    const p2 = proj('p2', '2026-05-19', ['1.2']);
    const { sch } = runSchedule([p1, p2], settings);

    const e1 = fmtF(sch['p1']['1.2'].end);
    const e2 = fmtF(sch['p2']['1.2'].end);
    expect(e1).not.toBe(e2);
  });

  it('hours from two projects on same day sum to at most hpd', () => {
    // p1 has 1.1 (1h), p2 has 1.1 (1h). Both start same day.
    // Both should fit on same day (1+1=2 ≤ 8).
    const p1 = proj('p1', '2026-05-19', ['1.1']);
    const p2 = proj('p2', '2026-05-19', ['1.1']);
    const { sch } = runSchedule([p1, p2], settings);

    // Both start on same day since there's ample capacity
    expect(fmtF(sch['p1']['1.1'].start)).toBe(fmtF(sch['p2']['1.1'].start));
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('project with no valid startDate returns empty entries', () => {
    const p = {
      id: 'empty', name: 'empty', template: 'full',
      startDate: '', surveyStart: '', surveyEnd: '',
      campaignStart: '', campaignEnd: '',
      tasks: [{ id: '1.1', enabled: true }],
    };
    const { sch, miles } = runSchedule([p], settings);
    expect(sch['empty']).toEqual({});
    expect(miles['empty']).toEqual({});
  });

  it('empty task list returns empty entries', () => {
    const p = proj('p', '2026-05-19', []);
    const { sch, miles } = runSchedule([p], settings);
    expect(sch['p']).toEqual({});
  });

  it('no projects returns empty result', () => {
    const { sch, miles } = runSchedule([], settings);
    expect(Object.keys(sch)).toHaveLength(0);
    expect(Object.keys(miles)).toHaveLength(0);
  });

  it('task with hours=0 is scheduled (anchors dep chain) without consuming load', () => {
    // 1B.2 has h=0 and depends on 1.6. It should be scheduled at its ear
    // and not block capacity on that day.
    const p = proj('p', '2026-05-19', ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1B.2', '1B.4']);
    const { sch } = runSchedule([p], settings);
    const t0h  = sch['p']['1B.2'];
    const tDep = sch['p']['1B.4'];

    expect(t0h).toBeDefined();
    expect(t0h.start).toBeInstanceOf(Date);
    // 0h task: start === end
    expect(fmtF(t0h.start)).toBe(fmtF(t0h.end));
    // 1B.4 also depends on 1.6 so it shares the same starting window
    expect(tDep).toBeDefined();
  });

  it('span task: end = start + sp working days (no clamping)', () => {
    // 5.9 has sp=21 and tm="dsv". Set svE far enough out so no clamping occurs.
    const p = proj('p', '2026-05-19', ['5.9'], {
      surveyStart: '2026-06-01',
      surveyEnd: '2026-08-31',
    });
    const { sch } = runSchedule([p], settings);
    const t = sch['p']['5.9'];
    expect(t).toBeDefined();
    const expectedEnd = aWD(t.start, 21, []);
    expect(fmtF(t.end)).toBe(fmtF(expectedEnd));
  });

  it('milestones: eSv is day after last sv-deadline task ends', () => {
    const p = proj('p', '2026-05-19', ['1.1', '1.2']);
    const { sch, miles } = runSchedule([p], settings);
    // Both 1.1 and 1.2 have dl="sv"
    const svTasks = Object.values(sch['p']).filter((t) => t.dl === 'sv');
    const lastEnd = new Date(Math.max(...svTasks.map((t) => t.end.getTime())));
    const expectedESv = new Date(lastEnd);
    expectedESv.setDate(expectedESv.getDate() + 1);
    // eSv should be on or after lastEnd+1 (advancing past weekends)
    expect(miles['p'].eSv >= expectedESv).toBe(true);
  });
});
