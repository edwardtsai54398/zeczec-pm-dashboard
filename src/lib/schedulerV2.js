import { BT } from './tasks.js';
import {
  pD as parseDate,
  addD as addDays,
  nWD as nextWorkDay,
  aWD as addWorkDays,
  sWD as subWorkDays,
  isWE as isWeekend,
  isBO as isBlackout,
} from './dateUtils.js';

// dateDef: { baseline, direction?, d?, unit? }
// refDates: { svS, svE, cpS, cpE } — all Date | null
function resolveDate(dateDef, refDates, blackouts) {
  if (!dateDef) return null;
  const baseline = refDates[dateDef.baseline];
  if (!baseline) return null;
  if (!dateDef.direction) return baseline;
  const days = dateDef.d || 0;
  if (dateDef.direction === 'pre') {
    return dateDef.unit === 'w' ? subWorkDays(baseline, days, blackouts) : addDays(baseline, -days);
  }
  return dateDef.unit === 'w' ? addWorkDays(baseline, days, blackouts) : addDays(baseline, days);
}

// Returns true when two dateDefs describe the same calendar date
function sameDateDef(a, b) {
  if (!a || !b) return false;
  return a.baseline === b.baseline && a.direction === b.direction
    && a.d === b.d && a.unit === b.unit;
}

export function mkTasks(tpl) {
  return BT.map((t) => ({
    id: t.id,
    enabled: tpl === "pm" ? (t.pm > 0 || t.w > 0 || t.h === 0) && !t.sh : true,
  }));
}

export function runScheduleV2(projects, settings) {

  const blackouts = settings?.blackouts || [];
  const hoursPerDay = settings?.hoursPerDay || 8;

  const projStates = [];
  for (const proj of projects) {
    const rawStart = parseDate(proj.startDate);
    if (!rawStart) continue;

    const projStart = nextWorkDay(rawStart, blackouts);
    const isPM = proj.template === 'pm';
    const projTaskMap = Object.fromEntries((proj.tasks || []).map((t) => [t.id, t]));
    const enabledIds = new Set((proj.tasks || []).filter((t) => t.enabled).map((t) => t.id));

    const svStart = parseDate(proj.surveyStart);
    const svEnd   = parseDate(proj.surveyEnd);
    const cpStart = parseDate(proj.campaignStart);
    const cpEnd   = parseDate(proj.campaignEnd);
    const refDates = { svS: svStart, svE: svEnd, cpS: cpStart, cpE: cpEnd };

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
          dl:          t.dl,
          ns:          t.ns || false,
          d:           t.d || [],
          hardDeadline: resolveDate(t.dl, refDates, blackouts),
          // pinnedDate: 0-hour posting tasks whose minStart and dl point to the same calendar date
          pinnedDate:  (t.h === 0 && sameDateDef(t.minStart, t.dl))
                         ? resolveDate(t.minStart, refDates, blackouts)
                         : null,
          // pinnedStart: manually overridden earliest start from project settings
          pinnedStart: pt.pinnedStart ? parseDate(pt.pinnedStart) : null,
        };
      });

    projStates.push({
      proj,
      projStart,
      svStart,
      svEnd,
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

  if (projStates.length === 0) return buildResult(projStates, projects, blackouts);

  const simStart = projStates.reduce(
    (min, projState) => (projState.projStart < min ? projState.projStart : min),
    projStates[0].projStart,
  );

  let day = new Date(simStart);
  const MAX_DAYS = 1500;

  for (let d = 0; d < MAX_DAYS; d++) {
    if (isWeekend(day) || isBlackout(day, blackouts)) {
      // pinned 0-hour tasks (7.3/7.5/7.7) trigger on their exact calendar date, even on weekends
      for (const projState of projStates) {
        for (let i = 0; i < projState.queue.length; i++) {
          const entry = projState.queue[i];
          if (projState.doneMap[entry.id] || entry.hours > 0) continue;
          const pin = entry.pinnedDate || entry.pinnedStart;
          if (!pin || +pin !== +day) continue;
          const canStart = taskCanStart(entry, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
          if (canStart === null || canStart > day) continue;
          projState.done.push(makeRecord(entry, day, day, null));
          projState.doneMap[entry.id] = { end: day, waitEnd: null };
        }
      }
      day = addDays(day, 1);
      continue;
    }

    const anyRemaining = projStates.some(
      (projState) => projState.qIdx < projState.queue.length || projState.currentTask || projState.currentTask2
    );
    if (!anyRemaining) break;

    let capacity = hoursPerDay;
    let madeProgress = true; // 只要有任何任務推進，就再跑一輪；直到無任何進展才停止（fixpoint）
    let safety = 0;

    while (madeProgress && safety++ < 400) {
      madeProgress = false;

      // 2a: advance 0-hour tasks (consume no capacity)
      for (const projState of projStates) {
        while (projState.qIdx < projState.queue.length && !projState.currentTask) {
          const entry = projState.queue[projState.qIdx];
          // skip tasks already completed (may have been processed by look-ahead)
          if (projState.doneMap[entry.id]) { projState.qIdx++; madeProgress = true; continue; }
          if (entry.hours > 0) break;
          const canStart = taskCanStart(entry, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
          if (canStart === null || canStart > day) break;
          const waitEnd = entry.w > 0 ? addWorkDays(day, entry.w, []) : null;
          projState.done.push(makeRecord(entry, day, day, waitEnd));
          projState.doneMap[entry.id] = { end: day, waitEnd };
          projState.qIdx++;
          madeProgress = true;
        }
      }

      // 2b: start next non-zero task(s) per project
      for (const projState of projStates) {
        // advance qIdx past tasks already completed out-of-order
        while (projState.qIdx < projState.queue.length && projState.doneMap[projState.queue[projState.qIdx].id]) projState.qIdx++;

        // main slot
        if (!projState.currentTask && projState.qIdx < projState.queue.length) {
          const entry = projState.queue[projState.qIdx];
          if (entry.hours > 0) {
            const canStart = taskCanStart(entry, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
            if (canStart !== null && canStart <= day) {
              // ns tasks must complete same day — don't start if insufficient capacity remains
              if (!entry.ns || capacity >= entry.hours) {
                projState.currentTask = { entry, start: day, remaining: entry.hours };
                projState.qIdx++;
              }
            }
          }
        }

        // currentTask2 slot: fill idle time when main slot is blocked, and continue
        // Phase 3/4A chains once they've been activated
        if (!projState.currentTask2) {
          // find the first non-zero-hour undone task at or after qIdx
          let frontTask = null;
          let frontCS = null;
          for (let i = projState.qIdx; i < projState.queue.length; i++) {
            const e = projState.queue[i];
            if (projState.doneMap[e.id] || e.hours === 0) continue;
            frontTask = e;
            frontCS = taskCanStart(e, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
            break;
          }
          const mainBlocked = frontTask !== null && frontCS !== null && frontCS > day;

          // Run fill when blocked (standard), or continue Phase 3/4A chains already started
          if (mainBlocked || projState.fillUnlocked) {
            for (const entry of projState.queue) {
              if (projState.doneMap[entry.id]) continue;
              if (entry.id === frontTask?.id) continue;
              if (projState.currentTask?.entry.id === entry.id) continue;

              // When not blocked but fill chain is ongoing: only continue Phase 3/4A
              if (!mainBlocked && projState.fillUnlocked) {
                if (entry._task.p !== '3' && entry._task.p !== '4A') continue;
              }

              if (entry.hours === 0) {
                // inline-process 0-hour tasks so their dependents can start counting
                const cs = taskCanStart(entry, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
                if (cs !== null && cs <= day) {
                  const wEnd = entry.w > 0 ? addWorkDays(day, entry.w, []) : null;
                  projState.done.push(makeRecord(entry, day, day, wEnd));
                  projState.doneMap[entry.id] = { end: day, waitEnd: wEnd };
                  madeProgress = true;
                }
                continue;
              }

              const cs = taskCanStart(entry, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
              if (cs !== null && cs <= day) {
                projState.currentTask2 = { entry, start: day, remaining: entry.hours };
                // Unlock Phase 3/4A chain continuation once activated
                if (entry._task.p === '3' || entry._task.p === '4A') {
                  projState.fillUnlocked = true;
                }
                break;
              }
            }
          }
        }
      }

      // 2c: allocate capacity, closest hardDeadline first
      if (capacity > 0) {
        const inProgressSlots = [];
        for (const projState of projStates) {
          if (projState.currentTask)  inProgressSlots.push({ projState, activeTask: projState.currentTask,  slot: 'main' });
          if (projState.currentTask2) inProgressSlots.push({ projState, activeTask: projState.currentTask2, slot: 'secondary' });
        }
        inProgressSlots.sort((a, b) => {
          // ns tasks claim capacity first to avoid being split across days
          if (a.activeTask.entry.ns && !b.activeTask.entry.ns) return -1;
          if (!a.activeTask.entry.ns && b.activeTask.entry.ns) return 1;
          // within ns group: smaller remaining hours first so short tasks complete same day
          if (a.activeTask.entry.ns && b.activeTask.entry.ns) return a.activeTask.remaining - b.activeTask.remaining;
          const deadlineA = a.activeTask.entry.hardDeadline;
          const deadlineB = b.activeTask.entry.hardDeadline;
          if (!deadlineA && !deadlineB) return 0;
          if (!deadlineA) return 1;
          if (!deadlineB) return -1;
          return deadlineA - deadlineB;
        });

        for (const { projState, activeTask, slot } of inProgressSlots) {
          if (capacity <= 0) break;
          const alloc = Math.min(activeTask.remaining, capacity);
          activeTask.remaining -= alloc;
          capacity -= alloc;

          if (activeTask.remaining <= 0) {
            // wait period = external party's calendar; user blackouts don't apply
            const waitEnd = activeTask.entry.w > 0 ? addWorkDays(day, activeTask.entry.w, []) : null;
            projState.done.push(makeRecord(activeTask.entry, activeTask.start, day, waitEnd));
            projState.doneMap[activeTask.entry.id] = { end: day, waitEnd };
            if (slot === 'main') projState.currentTask  = null;
            else                 projState.currentTask2 = null;
            madeProgress = true;
          }
        }
      }
    }

    day = addDays(day, 1);
  }


  return buildResult(projStates, projects, blackouts);
}

function taskCanStart(entry, doneMap, projStart, enabledIds, blackouts, svStart, svEnd, cpStart, cpEnd) {
  let canStart = projStart;

  // 1. Hard dependencies
  for (const depId of (entry.d || [])) {
    if (!enabledIds.has(depId)) continue;
    if (!doneMap[depId]) return null;
    const dep = doneMap[depId];
    const depEff = dep.waitEnd ? nextWorkDay(addDays(dep.waitEnd, 1), blackouts) : dep.end;
    if (depEff > canStart) canStart = depEff;
  }

  // 2. minStart constraint from task definition
  const ms = entry._task.minStart;
  if (ms) {
    let msBaseline;
    if (ms.baseline === 'svS') {
      if (svStart) {
        msBaseline = svStart;
      } else {
        if (enabledIds.has('2.20') && !doneMap['2.20']) return null;
        msBaseline = doneMap['2.20']?.end ?? null;
      }
    } else if (ms.baseline === 'svE') {
      msBaseline = svEnd;
    } else if (ms.baseline === 'cpS') {
      msBaseline = cpStart;
    } else if (ms.baseline === 'cpE') {
      msBaseline = cpEnd;
    }

    if (msBaseline) {
      const resolvedRefDates = { svS: msBaseline, svE: svEnd, cpS: cpStart, cpE: cpEnd };
      const resolvedMinStart = resolveDate(ms, resolvedRefDates, blackouts);
      if (resolvedMinStart && resolvedMinStart > canStart) canStart = resolvedMinStart;
    }
  }

  // 3. pinnedDate / pinnedStart overrides
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

function buildResult(projStates, projects, blackouts) {
  const schedule   = {};
  const milestones = {};

  for (const projState of projStates) {
    const pid = projState.proj.id;
    schedule[pid] = {};

    let sv219End = null;
    for (const rec of projState.done) {
      schedule[pid][rec.id] = rec;
      if (rec.id === '2.20') sv219End = rec.end;
    }

    // earliestSurveyStart: next WD after task 2.20 (問卷開跑) ends
    const earliestSurveyStart = sv219End ? nextWorkDay(addDays(sv219End, 1), blackouts) : null;

    // earliestCampaignEnd: (surveyEnd || surveyStart+30 || earliestSurveyStart+30) + 5 WD
    const surveyEndDate   = parseDate(projState.proj.surveyEnd);
    const surveyStartDate = parseDate(projState.proj.surveyStart);
    const cpBase = surveyEndDate
      ? surveyEndDate
      : surveyStartDate
        ? addDays(surveyStartDate, 30)
        : earliestSurveyStart
          ? addDays(earliestSurveyStart, 30)
          : null;
    const earliestCampaignEnd = cpBase ? addWorkDays(cpBase, 5, blackouts) : null;

    milestones[pid] = {
      eSv: earliestSurveyStart,
      eCp: earliestCampaignEnd,
      calcStart: projState.projStart,
    };
  }

  for (const proj of projects) {
    if (!schedule[proj.id])   schedule[proj.id]   = {};
    if (!milestones[proj.id]) milestones[proj.id] = {};
  }


  return { sch: schedule, miles: milestones };
}
