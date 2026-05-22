import { BT } from './tasks.js';
import { pD, addD, nWD, aWD, sWD, isWE, isBO } from './dateUtils.js';

export function mkTasks(tpl) {
  return BT.map((t) => ({
    id: t.id,
    enabled: tpl === "pm" ? (t.pm > 0 || t.w > 0 || t.h === 0) && !t.sh : true,
  }));
}

export function runScheduleV2(projects, settings) {

  const bl = settings?.blackouts || [];
  const hpd = settings?.hoursPerDay || 8;

  const states = [];
  for (const proj of projects) {
    const rawStart = pD(proj.startDate);
    if (!rawStart) continue;

    const projStart = nWD(rawStart, bl);
    const isPM = proj.template === 'pm';
    const projTaskMap = Object.fromEntries((proj.tasks || []).map((t) => [t.id, t]));
    const enabledIds = new Set((proj.tasks || []).filter((t) => t.enabled).map((t) => t.id));

    const cpStart = pD(proj.campaignStart);
    const cpEnd   = pD(proj.campaignEnd);
    const preNDates = {
      ...(cpStart ? {
        pre7:  addD(cpStart, -7),
        pre3:  addD(cpStart, -3),
        pre1:  addD(cpStart, -1),
        dcp0:  cpStart,
        dcp1:  addD(cpStart, 1),
        dcp23: addD(cpStart, 23),
        dcp30: addD(cpStart, 30),
      } : {}),
      ...(cpEnd ? {
        pre7e: addD(cpEnd, -7),
        post1: addD(cpEnd, 1),
        post7: aWD(cpEnd, 7, bl),
      } : {}),
    };

    const queue = BT
      .filter((t) => enabledIds.has(t.id))
      .map((t) => {
        const pt = projTaskMap[t.id] || {};
        return {
          _task:      t,
          id:         t.id,
          pid:        proj.id,
          pn:         proj.name,
          hours:      pt.pinnedHours != null ? pt.pinnedHours : (isPM ? t.pm : t.h),
          w:          pt.pinnedWait  != null ? pt.pinnedWait  : (t.w || 0),
          dl:         t.dl,
          tm:         t.tm,
          sp:         t.sp || 0,
          ns:         t.ns || false,
          d:          t.d || [],
          pinnedDate:  t.tm && preNDates[t.tm] ? preNDates[t.tm] : null,
          pinnedStart: pt.pinnedStart ? pD(pt.pinnedStart) : null,
          hardDeadline:
            (t.tmDl && preNDates[t.tmDl])
              ? sWD(preNDates[t.tmDl], 3, bl)
              : t.dl === 'sv'    ? pD(proj.surveyStart)
              : t.dl === 'cp'    ? (t.dlb && cpStart ? sWD(cpStart, t.dlb, bl) : cpStart)
              : t.dl === 'pre10' ? (cpStart ? sWD(cpStart, 10, bl) : null)
              : null,
        };
      });

    states.push({
      proj,
      projStart,
      cpStart,
      cpEnd,
      enabledIds,
      queue,
      qIdx:         0,
      currentTask:  null,
      currentTask2: null,
      done:         [],
      doneMap:      {},
      fillUnlocked: false, // true once Phase 3 or 4A task starts in secondary slot
    });
  }

  if (states.length === 0) return buildResult(states, projects, bl);

  const simStart = states.reduce(
    (min, s) => (s.projStart < min ? s.projStart : min),
    states[0].projStart,
  );

  let day = new Date(simStart);
  const MAX_DAYS = 1500;

  for (let d = 0; d < MAX_DAYS; d++) {
    if (isWE(day) || isBO(day, bl)) {
      // pinned 0-hour tasks (7.3/7.5/7.7) trigger on their exact calendar date, even on weekends
      for (const s of states) {
        for (let i = 0; i < s.queue.length; i++) {
          const entry = s.queue[i];
          if (s.doneMap[entry.id] || entry.hours > 0) continue;
          const pin = entry.pinnedDate || entry.pinnedStart;
          if (!pin || +pin !== +day) continue;
          const canStart = taskCanStart(entry, s.doneMap, s.projStart, s.enabledIds, bl, s.cpStart, s.cpEnd);
          if (canStart === null || canStart > day) continue;
          s.done.push(makeRecord(entry, day, day, null));
          s.doneMap[entry.id] = { end: day, waitEnd: null };
        }
      }
      day = addD(day, 1);
      continue;
    }

    const anyRemaining = states.some(
      (s) => s.qIdx < s.queue.length || s.currentTask || s.currentTask2
    );
    if (!anyRemaining) break;

    let capacity = hpd;
    let changed = true;
    let safety = 0;

    while (changed && safety++ < 400) {
      changed = false;

      // 2a: advance 0-hour tasks (consume no capacity)
      for (const s of states) {
        while (s.qIdx < s.queue.length && !s.currentTask) {
          const entry = s.queue[s.qIdx];
          // skip tasks already completed (may have been processed by look-ahead)
          if (s.doneMap[entry.id]) { s.qIdx++; changed = true; continue; }
          if (entry.hours > 0) break;
          const canStart = taskCanStart(entry, s.doneMap, s.projStart, s.enabledIds, bl, s.cpStart, s.cpEnd);
          if (canStart === null || canStart > day) break;
          const waitEnd = entry.w > 0 ? aWD(day, entry.w, []) : null;
          s.done.push(makeRecord(entry, day, day, waitEnd));
          s.doneMap[entry.id] = { end: day, waitEnd };
          s.qIdx++;
          changed = true;
        }
      }

      // 2b: start next non-zero task(s) per project
      for (const s of states) {
        // advance qIdx past tasks already completed out-of-order
        while (s.qIdx < s.queue.length && s.doneMap[s.queue[s.qIdx].id]) s.qIdx++;

        // main slot
        if (!s.currentTask && s.qIdx < s.queue.length) {
          const entry = s.queue[s.qIdx];
          if (entry.hours > 0) {
            const canStart = taskCanStart(entry, s.doneMap, s.projStart, s.enabledIds, bl, s.cpStart, s.cpEnd);
            if (canStart !== null && canStart <= day) {
              // ns tasks must complete same day — don't start if insufficient capacity remains
              if (!entry.ns || capacity >= entry.hours) {
                s.currentTask = { entry, start: day, remaining: entry.hours };
                s.qIdx++;
              }
            }
          }
        }

        // currentTask2 slot: fill idle time when main slot is blocked, and continue
        // Phase 3/4A chains once they've been activated
        if (!s.currentTask2) {
          // find the first non-zero-hour undone task at or after qIdx
          let frontTask = null;
          let frontCS = null;
          for (let i = s.qIdx; i < s.queue.length; i++) {
            const e = s.queue[i];
            if (s.doneMap[e.id] || e.hours === 0) continue;
            frontTask = e;
            frontCS = taskCanStart(e, s.doneMap, s.projStart, s.enabledIds, bl, s.cpStart, s.cpEnd);
            break;
          }
          const mainBlocked = frontTask !== null && frontCS !== null && frontCS > day;

          // Run fill when blocked (standard), or continue Phase 3/4A chains already started
          if (mainBlocked || s.fillUnlocked) {
            for (const entry of s.queue) {
              if (s.doneMap[entry.id]) continue;
              if (entry.id === frontTask?.id) continue;
              if (s.currentTask?.entry.id === entry.id) continue;

              // When not blocked but fill chain is ongoing: only continue Phase 3/4A
              if (!mainBlocked && s.fillUnlocked) {
                if (entry._task.p !== '3' && entry._task.p !== '4A') continue;
              }

              if (entry.hours === 0) {
                // inline-process 0-hour tasks so their dependents can start counting
                const cs = taskCanStart(entry, s.doneMap, s.projStart, s.enabledIds, bl, s.cpStart, s.cpEnd);
                if (cs !== null && cs <= day) {
                  const wEnd = entry.w > 0 ? aWD(day, entry.w, []) : null;
                  s.done.push(makeRecord(entry, day, day, wEnd));
                  s.doneMap[entry.id] = { end: day, waitEnd: wEnd };
                  changed = true;
                }
                continue;
              }

              const cs = taskCanStart(entry, s.doneMap, s.projStart, s.enabledIds, bl, s.cpStart, s.cpEnd);
              if (cs !== null && cs <= day) {
                s.currentTask2 = { entry, start: day, remaining: entry.hours };
                // Unlock Phase 3/4A chain continuation once activated
                if (entry._task.p === '3' || entry._task.p === '4A') {
                  s.fillUnlocked = true;
                }
                break;
              }
            }
          }
        }
      }

      // 2c: allocate capacity, closest hardDeadline first
      if (capacity > 0) {
        const active = [];
        for (const s of states) {
          if (s.currentTask)  active.push({ s, ct: s.currentTask,  slot: 'main' });
          if (s.currentTask2) active.push({ s, ct: s.currentTask2, slot: 'secondary' });
        }
        active.sort((a, b) => {
          // ns tasks claim capacity first to avoid being split across days
          if (a.ct.entry.ns && !b.ct.entry.ns) return -1;
          if (!a.ct.entry.ns && b.ct.entry.ns) return 1;
          // within ns group: smaller remaining hours first so short tasks complete same day
          if (a.ct.entry.ns && b.ct.entry.ns) return a.ct.remaining - b.ct.remaining;
          const da = a.ct.entry.hardDeadline;
          const db = b.ct.entry.hardDeadline;
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return da - db;
        });

        for (const { s, ct, slot } of active) {
          if (capacity <= 0) break;
          const alloc = Math.min(ct.remaining, capacity);
          ct.remaining -= alloc;
          capacity -= alloc;

          if (ct.remaining <= 0) {
            // wait period = external party's calendar; user blackouts don't apply
            const waitEnd = ct.entry.w > 0 ? aWD(day, ct.entry.w, []) : null;
            s.done.push(makeRecord(ct.entry, ct.start, day, waitEnd));
            s.doneMap[ct.entry.id] = { end: day, waitEnd };
            if (slot === 'main') s.currentTask  = null;
            else                 s.currentTask2 = null;
            changed = true;
          }
        }
      }
    }

    day = addD(day, 1);
  }

  
  return buildResult(states, projects, bl);
}

function taskCanStart(entry, doneMap, projStart, enabledIds, bl, cpStart, cpEnd) {
  let canStart = projStart;
  for (const depId of (entry.d || [])) {
    if (!enabledIds.has(depId)) continue;
    if (!doneMap[depId]) return null;
    const dep = doneMap[depId];
    const depEff = dep.waitEnd ? nWD(addD(dep.waitEnd, 1), bl) : dep.end;
    if (depEff > canStart) canStart = depEff;
  }
  if (entry.tm === 'sv30') {
    if (!doneMap['2.20']) return null;
    const sv30 = nWD(addD(doneMap['2.20'].end, 30), bl);
    if (sv30 > canStart) canStart = sv30;
  }
  // Phases 5, 6, 7, 8, 9 cannot start before 問卷開跑 (2.20) is done
  if (['5', '6', '7', '8', '9'].includes(entry._task.p) && enabledIds.has('2.20')) {
    if (!doneMap['2.20']) return null;
    if (doneMap['2.20'].end > canStart) canStart = doneMap['2.20'].end;
  }
  // Phase 8 cannot start before campaign launch (cpStart)
  if (entry._task.p === '8' && cpStart) {
    const ms8 = nWD(cpStart, bl);
    if (ms8 > canStart) canStart = ms8;
  }
  // Phase 9 cannot start before campaign end (cpEnd)
  if (entry._task.p === '9' && cpEnd) {
    const ms9 = nWD(addD(cpEnd, 1), bl);
    if (ms9 > canStart) canStart = ms9;
  }
  if (entry.pinnedDate  && entry.pinnedDate  > canStart) canStart = entry.pinnedDate;
  if (entry.pinnedStart && entry.pinnedStart > canStart) canStart = entry.pinnedStart;
  return canStart;
}

function makeRecord(entry, start, end, waitEnd) {
  return {
    ...entry._task,
    hours:   entry.hours,
    w:       entry.w,
    start,
    end,
    waitEnd,
    pid:     entry.pid,
    pn:      entry.pn,
    effH:    entry.hours,
  };
}

function buildResult(states, projects, bl) {
  const sch   = {};
  const miles = {};

  for (const s of states) {
    const pid = s.proj.id;
    sch[pid] = {};

    let sv219End = null;
    for (const rec of s.done) {
      sch[pid][rec.id] = rec;
      if (rec.id === '2.20') sv219End = rec.end;
    }

    // eSv: next WD after task 2.20 (問卷開跑) ends
    const eSv = sv219End ? nWD(addD(sv219End, 1), bl) : null;

    // eCp: (surveyEnd || surveyStart+30 || eSv+30) + 5 WD
    const surveyEndDate   = pD(s.proj.surveyEnd);
    const surveyStartDate = pD(s.proj.surveyStart);
    const cpBase = surveyEndDate
      ? surveyEndDate
      : surveyStartDate
        ? addD(surveyStartDate, 30)
        : eSv
          ? addD(eSv, 30)
          : null;
    const eCp = cpBase ? aWD(cpBase, 5, bl) : null;

    miles[pid] = {
      eSv,
      eCp,
      calcStart: s.projStart,
    };
  }

  for (const proj of projects) {
    if (!sch[proj.id])   sch[proj.id]   = {};
    if (!miles[proj.id]) miles[proj.id] = {};
  }
  

  return { sch, miles };
}
