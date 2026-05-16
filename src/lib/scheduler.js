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

export function runSchedule(projects, settings) {
  const bl = settings.blackouts || [];
  const hpd = settings.hoursPerDay || 8;
  const result = {}, load = {}, miles = {};

  const gk = (d) => fmtF(d);
  const gl = (d) => load[gk(d)] || 0;
  const al = (d, h) => { load[gk(d)] = (load[gk(d)] || 0) + h; };

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

    if (!start) { result[proj.id] = {}; miles[proj.id] = {}; continue; }

    const order = [], vis = new Set();
    const visit = (id) => {
      if (vis.has(id)) return;
      vis.add(id);
      const t = tm[id];
      if (!t) return;
      for (const x of t.d) if (tm[x]) visit(x);
      order.push(id);
    };
    Object.keys(tm).forEach(visit);

    const sch = {};
    for (const id of order) {
      const task = tm[id];
      if (!task) continue;
      let ear = nWD(start, bl);

      for (const did of task.d) {
        const ds = sch[did];
        if (ds) {
          let af = addD(ds.end, 1);
          const dt = tm[did];
          if (dt && dt.w > 0) af = addD(aWD(ds.end, dt.w, bl), 1);
          af = nWD(af, bl);
          if (af > ear) ear = af;
        }
      }

      if (task.tm === "dsv" && svS) { const s = nWD(svS, bl); if (s > ear) ear = s; }
      if (task.tm === "dcp" && cpS) { const s = nWD(cpS, bl); if (s > ear) ear = s; }
      if (task.tm === "post" && cpE) { const s = nWD(addD(cpE, 1), bl); if (s > ear) ear = s; }

      const hrs = task.hours || 0;
      const span = task.sp || 0;
      let tS = ear, tE = ear;

      if (span > 0) {
        tE = aWD(tS, span, bl);
        if (task.tm === "dcp" && cpE && tE > cpE) tE = new Date(cpE);
        if (task.tm === "dsv" && svE && tE > svE) tE = new Date(svE);
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

      const waitEnd = task.w > 0 ? aWD(tE, task.w, bl) : null;
      sch[id] = { ...task, start: tS, end: tE, waitEnd, pid: proj.id, pn: proj.name };
    }

    const svB = Object.values(sch).filter((t) => t.dl === "sv");
    const cpB = Object.values(sch).filter((t) => t.dl === "cp");
    const eSv = svB.length
      ? nWD(addD(new Date(Math.max(...svB.map((t) => t.end.getTime()))), 1), bl)
      : null;
    const eCp = cpB.length
      ? nWD(addD(new Date(Math.max(...cpB.map((t) => t.end.getTime()))), 1), bl)
      : null;

    result[proj.id] = sch;
    miles[proj.id] = { eSv, eCp, calcStart: start };
  }

  return { sch: result, miles };
}
