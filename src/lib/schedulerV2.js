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
    const projTaskMap = Object.fromEntries((proj.tasks || []).map((t) => [t.id, t]));
    const enabledIds = new Set((proj.tasks || []).filter((t) => t.enabled).map((t) => t.id));

    const outsourcedIds = new Set(
      (proj.tasks || []).filter((t) => t.outsourced && t.enabled).map((t) => t.id)
    );
    for (const id of outsourcedIds) enabledIds.add(id + ".1");

    const svStart = parseDate(proj.surveyStart);
    const svEnd   = parseDate(proj.surveyEnd);
    const cpStart = parseDate(proj.campaignStart);
    const cpEnd   = parseDate(proj.campaignEnd);
    const refDates = { svS: svStart, svE: svEnd, cpS: cpStart, cpE: cpEnd };

    let queue = BT
      .filter((t) => enabledIds.has(t.id))
      .map((t) => {
        const pt = projTaskMap[t.id] || {};
        return {
          _task:      t,
          id:         t.id,
          pid:        proj.id,
          pn:         proj.name,
          hours:      pt.pinnedHours != null ? pt.pinnedHours : t.h,
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

    if (outsourcedIds.size > 0) {
      const expanded = [];
      for (const entry of queue) {
        if (outsourcedIds.has(entry.id)) {
          const remappedD = (entry.d || []).map((depId) =>
            outsourcedIds.has(depId) ? depId + ".1" : depId
          );
          expanded.push({ ...entry, hours: 0, w: Math.ceil(entry.hours / 8), d: remappedD });
          expanded.push({
            _task:       { ...entry._task, n: `(審核)${entry._task.n}` },
            id:          entry.id + ".1",
            pid:         entry.pid,
            pn:          entry.pn,
            hours:       0.5,
            w:           entry.w,
            dl:          entry.dl,
            ns:          entry.ns,
            d:           [entry.id],
            hardDeadline: entry.hardDeadline,
            pinnedDate:  null,
            pinnedStart: null,
          });
        } else {
          const newD = (entry.d || []).map((depId) =>
            outsourcedIds.has(depId) ? depId + ".1" : depId
          );
          expanded.push({ ...entry, d: newD });
        }
      }
      queue = expanded;
    }

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

  const allProjStart = projStates.reduce(
    (min, projState) => (projState.projStart < min ? projState.projStart : min),
    projStates[0].projStart,
  );

  let day = new Date(allProjStart);
  const MAX_DAYS = 1500;

  // 從所有專案的第一天開始找任務
  for (let d = 0; d < MAX_DAYS; d++) {
    // pinned tasks（系統釘選 pinnedDate 或使用者釘選 pinnedStart）在指定日期直接佔位，不受工作日限制
    for (const projState of projStates) {
      for (let i = 0; i < projState.queue.length; i++) {
        const entry = projState.queue[i];
        if (projState.doneMap[entry.id]) continue;
        const pin = entry.pinnedDate || entry.pinnedStart;
        if (!pin || +pin !== +day) continue;
        const canStart = taskCanStart(entry, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
        if (canStart === null || canStart > day) continue;
        const waitEnd = entry.w > 0 ? addWorkDays(day, entry.w, []) : null;
        projState.done.push(makeRecord(entry, day, day, waitEnd));
        projState.doneMap[entry.id] = { end: day, waitEnd };
      }
    }

    if (isWeekend(day) || isBlackout(day, blackouts)) {
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

      // 2b': build unified task pool (active + candidates), sort, allocate capacity
      const pool = [];

      for (const projState of projStates) {
        // add active tasks already in progress
        if (projState.currentTask) {
          pool.push({
            projState,
            activeTask: projState.currentTask,
            slot: 'main',
            isNew: false,
            queueIdx: projState.queue.findIndex(e => e.id === projState.currentTask.entry.id),
          });
        }
        if (projState.currentTask2) {
          pool.push({
            projState,
            activeTask: projState.currentTask2,
            slot: 'secondary',
            isNew: false,
            queueIdx: projState.queue.findIndex(e => e.id === projState.currentTask2.entry.id),
          });
        }

        // advance qIdx past tasks already completed out-of-order
        while (projState.qIdx < projState.queue.length && projState.doneMap[projState.queue[projState.qIdx].id]) projState.qIdx++;

        // main slot candidate
        let mainCandidateId = projState.currentTask?.entry.id ?? null;
        if (!projState.currentTask && projState.qIdx < projState.queue.length) {
          const entry = projState.queue[projState.qIdx];
          if (entry.hours > 0) {
            const canStart = taskCanStart(entry, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
            if (canStart !== null && canStart <= day) {
              pool.push({
                projState,
                activeTask: { entry, start: day, remaining: entry.hours },
                slot: 'main',
                isNew: true,
                queueIdx: projState.qIdx,
              });
              mainCandidateId = entry.id;
            }
          }
        }

        // secondary slot candidate (fill logic)
        if (!projState.currentTask2) {
          const { candidate, candidateIdx, inlineProgress } =
            scanFillSlot(projState, day, blackouts, mainCandidateId);
          if (inlineProgress) madeProgress = true;
          if (candidate !== null) {
            pool.push({
              projState,
              activeTask: { entry: candidate, start: day, remaining: candidate.hours },
              slot: 'secondary',
              isNew: true,
              queueIdx: candidateIdx,
            });
          }
        }
      }

      pool.sort(poolComparator);

      for (const { projState, activeTask, slot, isNew } of pool) {
        if (capacity <= 0) break;

        // ns candidate: skip if insufficient capacity (fixes Bug 1 & Bug 2)
        if (activeTask.entry.ns && capacity < activeTask.remaining) continue;

        // formally start new tasks
        if (isNew) {
          if (slot === 'main') {
            projState.currentTask = activeTask;
            projState.qIdx++;
          } else {
            projState.currentTask2 = activeTask;
            if (activeTask.entry._task.p === '3' || activeTask.entry._task.p === '4A') {
              projState.fillUnlocked = true;
            }
          }
        }

        const alloc = Math.min(activeTask.remaining, capacity);
        activeTask.remaining -= alloc;
        capacity -= alloc;

        if (activeTask.remaining <= 0) {
          const waitEnd = activeTask.entry.w > 0 ? addWorkDays(day, activeTask.entry.w, []) : null;
          projState.done.push(makeRecord(activeTask.entry, activeTask.start, day, waitEnd));
          projState.doneMap[activeTask.entry.id] = { end: day, waitEnd };
          if (slot === 'main') projState.currentTask  = null;
          else                 projState.currentTask2 = null;
          madeProgress = true;
        }
      }
    }

    day = addDays(day, 1);
  }


  return buildResult(projStates, projects, blackouts);
}

// Returns { candidate, candidateIdx, inlineProgress }
// mainActiveId: entry.id of current main-slot task (existing or isNew candidate), excluded from scan
function scanFillSlot(projState, day, blackouts, mainActiveId) {
  let candidate = null, candidateIdx = -1, inlineProgress = false;

  let frontTask = null, frontCanStart = null;
  for (let i = projState.qIdx; i < projState.queue.length; i++) {
    const e = projState.queue[i];
    if (projState.doneMap[e.id] || e.hours === 0) continue;
    frontTask = e;
    frontCanStart = taskCanStart(e, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
    break;
  }
  const mainBlocked = frontTask !== null && frontCanStart !== null && frontCanStart > day;

  if (!mainBlocked && !projState.fillUnlocked) return { candidate, candidateIdx, inlineProgress };

  for (let i = 0; i < projState.queue.length; i++) {
    const entry = projState.queue[i];
    if (projState.doneMap[entry.id]) continue;
    if (entry.id === frontTask?.id) continue;
    if (mainActiveId && entry.id === mainActiveId) continue;

    if (!mainBlocked && projState.fillUnlocked) {
      if (entry._task.p !== '3' && entry._task.p !== '4A') continue;
    }

    if (entry.hours === 0) {
      const canStart = taskCanStart(entry, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
      if (canStart !== null && canStart <= day) {
        const wEnd = entry.w > 0 ? addWorkDays(day, entry.w, []) : null;
        projState.done.push(makeRecord(entry, day, day, wEnd));
        projState.doneMap[entry.id] = { end: day, waitEnd: wEnd };
        inlineProgress = true;
      }
      continue;
    }

    const canStart = taskCanStart(entry, projState.doneMap, projState.projStart, projState.enabledIds, blackouts, projState.svStart, projState.svEnd, projState.cpStart, projState.cpEnd);
    if (canStart !== null && canStart <= day) {
      candidate = entry;
      candidateIdx = i;
      break;
    }
  }

  return { candidate, candidateIdx, inlineProgress };
}

function poolComparator(a, b) {
  const aNs = a.activeTask.entry.ns, bNs = b.activeTask.entry.ns;
  if (aNs && !bNs) return -1;
  if (!aNs && bNs) return 1;

  if (aNs && bNs) {
    const dA = a.activeTask.entry.hardDeadline, dB = b.activeTask.entry.hardDeadline;
    if (!dA && !dB) return b.activeTask.entry.hours - a.activeTask.entry.hours;
    if (!dA) return 1;
    if (!dB) return -1;
    const diff = dA - dB;
    if (diff !== 0) return diff;
    return b.activeTask.entry.hours - a.activeTask.entry.hours;
  }

  if (a.projState === b.projState) return a.queueIdx - b.queueIdx;

  const dA = a.activeTask.entry.hardDeadline, dB = b.activeTask.entry.hardDeadline;
  if (!dA && !dB) {
    if (a.slot === 'main' && b.slot !== 'main') return -1;
    if (a.slot !== 'main' && b.slot === 'main') return 1;
    return 0;
  }
  if (!dA) return 1;
  if (!dB) return -1;
  const ddiff = dA - dB;
  if (ddiff !== 0) return ddiff;

  if (a.slot === 'main' && b.slot !== 'main') return -1;
  if (a.slot !== 'main' && b.slot === 'main') return 1;
  return 0;
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
    id:      entry.id,
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
