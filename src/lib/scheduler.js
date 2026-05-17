import { BT } from './tasks.js';
import { fmtF, pD, addD, nWD, aWD, sWD, isWE, isBO } from './dateUtils.js';


export function mkTasks(tpl) {
  return BT.map((t) => ({
    id: t.id,
    enabled: tpl === "pm"
      ? (t.pm > 0 || t.w > 0 || t.h === 0) && !t.sh
      : true,
  }));
}

// ── Pure helpers (swap only schedulePool for Solution C) ──────────────────────

function buildGlobalPool(projects, settings) {
  const bl = settings.blackouts || [];
  const hpd = settings.hoursPerDay || 8;
  const pool = [];

  for (const proj of projects) {
    const isPM = proj.template === "pm";
    const enabled = (proj.tasks || []).filter((t) => t.enabled);

    const tm = {};
    for (const t of enabled) {
      const b = BT.find((x) => x.id === t.id);
      if (b) tm[t.id] = { ...b, hours: isPM ? b.pm : b.h };
    }

    let start = pD(proj.startDate);
    const svS = pD(proj.surveyStart);
    const svE = pD(proj.surveyEnd);
    const cpS = pD(proj.campaignStart);
    const cpE = pD(proj.campaignEnd);

    if (!start && cpS) {
      let th = 0, tw = 0;
      for (const t of Object.values(tm)) {
        if (t.dl) { th += t.hours || 0; if (t.w > 0) tw += t.w; }
      }
      const est = Math.ceil(th / hpd) + tw + 7;
      const ref = svS || sWD(cpS, 30, bl);
      start = sWD(ref, est, bl);
      start = nWD(start, bl);
    }

    if (!start) continue;

    for (const id of Object.keys(tm)) {
      const task = tm[id];
      pool.push({
        key:      `${proj.id}::${id}`,
        id,
        pid:      proj.id,
        pn:       proj.name,
        hours:    task.hours,
        w:        task.w || 0,
        dl:       task.dl,
        tm:       task.tm,
        sp:       task.sp || 0,
        d:        task.d,
        depKeys:  task.d.filter((did) => tm[did]).map((did) => `${proj.id}::${did}`),
        projStart: start,
        svS, svE, cpS, cpE,
        _task:    task,
      });
    }
  }

  return pool;
}

function isReady(entry, scheduled) {
  return entry.depKeys.every((dk) => dk in scheduled);
}

// Slack = available work-hours from earliest-start to deadline minus project's remaining hours.
// Recomputed each iteration so urgency shifts naturally as tasks are scheduled.
// Returns Infinity for tasks with no deadline so they sort to the back.
function calcSlack(entry, remaining, byKey, scheduled, settings) {
  const hpd = settings.hoursPerDay || 8;
  const bl  = settings.blackouts  || [];
  // Use the task's own milestone deadline, not the project-level fallback.
  // dl:"sv" tasks must finish before survey start; dl:"cp" before campaign start.
  const deadline = entry.dl === "sv" ? entry.svS
                 : entry.dl === "cp" ? entry.cpS
                 : null;
  if (!deadline) return Infinity;

  // Earliest this task can start (mirrors allocateTask's ear logic, without tm-pin adjustments)
  let ear = nWD(entry.projStart, bl);
  for (const dk of entry.depKeys) {
    const ds = scheduled[dk];
    if (ds) {
      let af = addD(ds.end, 1);
      if (ds.w > 0) af = addD(aWD(ds.end, ds.w, bl), 1);
      af = nWD(af, bl);
      if (af > ear) ear = af;
    }
  }

  // Only count tasks that share the same or earlier deadline category.
  // dl:"sv" tasks only compete for time before svS; dl:"cp" tasks must also
  // absorb the sv-deadline backlog since sv tasks will consume capacity first.
  const dlOrder = { sv: 1, cp: 2 };
  const entryDlRank = dlOrder[entry.dl] ?? 99;
  const projRemainingHours = [...remaining]
    .map((k) => byKey[k])
    .filter((e) => e.pid === entry.pid && (dlOrder[e.dl] ?? 99) <= entryDlRank)
    .reduce((sum, e) => sum + (e.hours || 0), 0);

  // Available work-hours from ear to deadline (5/7 approximation — good enough for ordering)
  const calDays  = Math.max(0, (deadline.getTime() - ear.getTime()) / 86400000);
  const availHours = (calDays * 5 / 7) * hpd;

  return availHours - projRemainingHours;
}

function allocateTask(entry, scheduled, gl, al, settings) {
  const bl = settings.blackouts || [];
  const hpd = settings.hoursPerDay || 8;
  const { svS, svE, cpS, cpE } = entry;

  let ear = nWD(entry.projStart, bl);

  for (const dk of entry.depKeys) {
    const ds = scheduled[dk];
    if (ds) {
      let af = addD(ds.end, 1);
      if (ds.w > 0) af = addD(aWD(ds.end, ds.w, bl), 1);
      af = nWD(af, bl);
      if (af > ear) ear = af;
    }
  }

  if (entry.tm === "dsv" && svS) { const s = nWD(svS, bl); if (s > ear) ear = s; }
  if (entry.tm === "dcp" && cpS) { const s = nWD(cpS, bl); if (s > ear) ear = s; }
  if (entry.tm === "post" && cpE) { const s = nWD(addD(cpE, 1), bl); if (s > ear) ear = s; }

  const hrs = entry.hours || 0;

  const span = entry.sp || 0;
  let tS = ear, tE = ear;

  if (span > 0) {
    tE = aWD(tS, span, bl);
    if (entry.tm === "dcp" && cpE && tE > cpE) tE = new Date(cpE);
    if (entry.tm === "dsv" && svE && tE > svE) tE = new Date(svE);
  } else if (hrs > 0) {
    let rem = hrs, cur = new Date(tS), safety = 0;
    while (rem > 0 && safety < 500) {
      if (!isWE(cur) && !isBO(cur, bl)) {
        const av = hpd - gl(cur);
        if (av > 0) { rem -= Math.min(rem, av); if (rem <= 0) { tE = cur; break; } }
      }
      cur = addD(cur, 1); safety++;
    }
    if (rem > 0) tE = cur;
    rem = hrs; cur = new Date(tS); safety = 0;
    while (rem > 0 && safety < 500) {
      if (!isWE(cur) && !isBO(cur, bl)) {
        const av = hpd - gl(cur);
        if (av > 0) { const u = Math.min(rem, av); al(cur, u); rem -= u; }
      }
      cur = addD(cur, 1); safety++;
    }
  }

  const waitEnd = entry.w > 0 ? aWD(tE, entry.w, bl) : null;
  return { ...entry._task, start: tS, end: tE, waitEnd, pid: entry.pid, pn: entry.pn, effH: hrs };
}

// Solution C: replace only this function with a min-heap driver.
// reverseDeps index (built in buildGlobalPool) will let C push successors on task completion.
function schedulePool(pool, settings) {
  const load = {};
  const gl = (d) => load[fmtF(d)] || 0;
  const al = (d, h) => { load[fmtF(d)] = (load[fmtF(d)] || 0) + h; };
  const scheduled = {};
  const remaining = new Set(pool.map((e) => e.key));
  const byKey = Object.fromEntries(pool.map((e) => [e.key, e]));
  let safety = 0;
  const MAX = pool.length ** 2 + 10;

  while (remaining.size > 0 && safety++ < MAX) {
    const ready = [...remaining]
      .map((k) => byKey[k])
      .filter((e) => isReady(e, scheduled))
      .sort((a, b) => calcSlack(a, remaining, byKey, scheduled, settings) - calcSlack(b, remaining, byKey, scheduled, settings));

    if (ready.length === 0) break;
    const entry = ready[0];
    scheduled[entry.key] = allocateTask(entry, scheduled, gl, al, settings);
    remaining.delete(entry.key);
  }

  return scheduled;
}

function reshapeResult(scheduled, pool, projects, settings) {
  const bl = settings.blackouts || [];
  const sch = {};
  const miles = {};

  const projStarts = {};
  for (const e of pool) {
    if (!projStarts[e.pid]) projStarts[e.pid] = e.projStart;
  }

  for (const rec of Object.values(scheduled)) {
    if (!sch[rec.pid]) sch[rec.pid] = {};
    sch[rec.pid][rec.id] = rec;
  }

  for (const pid of Object.keys(sch)) {
    const tasks = Object.values(sch[pid]);
    const svB = tasks.filter((t) => t.dl === "sv");
    const cpB = tasks.filter((t) => t.dl === "cp");
    const eSv = svB.length
      ? nWD(addD(new Date(Math.max(...svB.map((t) => t.end.getTime()))), 1), bl)
      : null;
    const eCp = cpB.length
      ? nWD(addD(new Date(Math.max(...cpB.map((t) => t.end.getTime()))), 1), bl)
      : null;
    miles[pid] = { eSv, eCp, calcStart: projStarts[pid] };
  }

  // Projects skipped (no valid startDate) still need empty entries for callers
  for (const proj of projects) {
    if (!sch[proj.id]) sch[proj.id] = {};
    if (!miles[proj.id]) miles[proj.id] = {};
  }

  return { sch, miles };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function runSchedule(projects, settings) {
  const pool = buildGlobalPool(projects, settings);
  const scheduled = schedulePool(pool, settings);
  return reshapeResult(scheduled, pool, projects, settings);
}
