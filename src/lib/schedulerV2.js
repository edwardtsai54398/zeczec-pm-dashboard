import { BT } from './tasks.js';
import { pD, addD, nWD, aWD, sWD, isWE, isBO } from './dateUtils.js';

export function mkTasks(tpl) {
  return BT.map((t) => ({
    id: t.id,
    enabled: tpl === "pm" ? (t.pm > 0 || t.w > 0 || t.h === 0) && !t.sh : true,
  }));
}

export function runScheduleV2(projects, settings) {
  // console.log(JSON.stringify(projects));
  // console.log(JSON.stringify(settings));

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
      enabledIds,
      queue,
      qIdx:         0,
      currentTask:  null,
      currentTask2: null,
      done:         [],
      doneMap:      {},
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
          const canStart = taskCanStart(entry, s.doneMap, s.projStart, s.enabledIds, bl);
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
          const canStart = taskCanStart(entry, s.doneMap, s.projStart, s.enabledIds, bl);
          if (canStart === null || canStart > day) break;
          const waitEnd = entry.w > 0 ? aWD(day, entry.w, bl) : null;
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
            const canStart = taskCanStart(entry, s.doneMap, s.projStart, s.enabledIds, bl);
            if (canStart !== null && canStart <= day) {
              s.currentTask = { entry, start: day, remaining: entry.hours };
              s.qIdx++;
            } else if (entry.tm === 'sv30' && canStart !== null && canStart > day) {
              // sv30-blocked: look ahead for next ready task (special case only)
              for (let i = s.qIdx + 1; i < s.queue.length; i++) {
                const ahead = s.queue[i];
                if (s.doneMap[ahead.id]) continue;
                if (s.currentTask2?.entry.id === ahead.id) continue;
                if (ahead.hours === 0) {
                  // process 0-hour tasks inline so their dependents can start
                  const cs = taskCanStart(ahead, s.doneMap, s.projStart, s.enabledIds, bl);
                  if (cs !== null && cs <= day) {
                    const wEnd = ahead.w > 0 ? aWD(day, ahead.w, bl) : null;
                    s.done.push(makeRecord(ahead, day, day, wEnd));
                    s.doneMap[ahead.id] = { end: day, waitEnd: wEnd };
                    changed = true;
                  }
                  continue;
                }
                const cs = taskCanStart(ahead, s.doneMap, s.projStart, s.enabledIds, bl);
                if (cs === null || cs > day) break;
                s.currentTask = { entry: ahead, start: day, remaining: ahead.hours };
                // qIdx stays at sv30-blocked position
                break;
              }
            }
          }
        }

        // currentTask2 slot: phase 3 and 4A parallel only
        if (!s.currentTask2) {
          const mainPhase = s.currentTask?.entry._task.p;
          for (const phase of ['3', '4A']) {
            if (phase === mainPhase) continue;
            const entry = s.queue.find(
              (e) =>
                e._task.p === phase &&
                !s.doneMap[e.id] &&
                e.hours > 0 &&
                e.id !== s.currentTask?.entry.id
            );
            if (!entry) continue;
            const cs = taskCanStart(entry, s.doneMap, s.projStart, s.enabledIds, bl);
            if (cs !== null && cs <= day) {
              s.currentTask2 = { entry, start: day, remaining: entry.hours };
              break;
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
            const waitEnd = ct.entry.w > 0 ? aWD(day, ct.entry.w, bl) : null;
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

  // const result = buildResult(states, projects, bl);
  // console.log("result:", result.sch.saba['2.2']);
  
  return buildResult(states, projects, bl);
}

function taskCanStart(entry, doneMap, projStart, enabledIds, bl) {
  let canStart = projStart;
  for (const depId of (entry.d || [])) {
    if (!enabledIds.has(depId)) continue;
    if (!doneMap[depId]) return null;
    const dep = doneMap[depId];
    const depEff = dep.waitEnd ? nWD(addD(dep.waitEnd, 1), bl) : dep.end;
    if (depEff > canStart) canStart = depEff;
  }
  if (entry.tm === 'sv30') {
    if (!doneMap['2.19']) return null;
    const sv30 = nWD(addD(doneMap['2.19'].end, 30), bl);
    if (sv30 > canStart) canStart = sv30;
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

    let eSv = null;
    let eCp = null;
    for (const rec of s.done) {
      sch[pid][rec.id] = rec;
      if (rec.dl === 'sv') eSv = eSv ? (rec.end > eSv ? rec.end : eSv) : rec.end;
      if (rec.dl === 'cp' || rec.dl === 'pre10') eCp = eCp ? (rec.end > eCp ? rec.end : eCp) : rec.end;
    }

    miles[pid] = {
      eSv:       eSv ? nWD(addD(eSv, 1), bl) : null,
      eCp:       eCp ? nWD(addD(eCp, 1), bl) : null,
      calcStart: s.projStart,
    };
  }

  for (const proj of projects) {
    if (!sch[proj.id])   sch[proj.id]   = {};
    if (!miles[proj.id]) miles[proj.id] = {};
  }
  

  return { sch, miles };
}
