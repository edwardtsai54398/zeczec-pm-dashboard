import { createContext, useContext, useMemo, useCallback } from 'react';
import { runScheduleV2 } from '../lib/schedulerV2.js';
import {
  hydrateSchedule, freezeSchedule, collectFrozen, collectDownstream, layoutSingleTask,
} from '../lib/scheduleStore.js';
import { BT } from '../lib/tasks.js';
import { pD, fmtF } from '../lib/dateUtils.js';
import { D_SETTINGS } from '../constants.js';
import { usePersistence } from '../hooks/usePersistence.js';
import { useCloudProjects } from '../hooks/useCloudProjects.js';
import { useCloudWorkspaceSettings } from '../hooks/useCloudWorkspaceSettings.js';
import { useMigrateSchedules } from '../hooks/useMigrateSchedules.js';
import { useWorkspaceMembers } from '../hooks/useWorkspaceMembers.js';
import { useAuthContext } from './AuthContext.jsx';

const WorkspaceContext = createContext(null);

// 算出某任務 assignee 的可用性(未指派/查無成員 → owner → 缺省用工作區每日工時),
// 給「只改這一個」的單人 placer layoutSingleTask 用。純函式,不捕捉元件狀態。
function availabilityForTask(members, settings, tasks, taskId) {
  const ownerId = members.find((member) => member.role === 'owner')?.user_id ?? null;
  const assignee = (tasks || []).find((task) => task.id === taskId)?.assignee || ownerId;
  const member = members.find((m) => m.user_id === assignee);
  return {
    dailyHours: member?.settings?.daily_hours ?? (settings?.hoursPerDay || 8),
    daysOff: member?.settings?.days_off ?? [],
  };
}

// 所有頁面共用的資料層:雲端 projects + 全域 settings + 排程結果 + 雲端寫入操作。
export function WorkspaceProvider({ children }) {
  const { workspaceId } = useAuthContext();

  // 預設專案給空陣列(不再塞示範資料):雲端才是唯一真相,全新使用者從零開始,
  // 也避免 useCloudProjects 的 seedFromLocal 把預設 demo 誤當成本地資料搬上雲。
  const { projects, setProjects, settings, setSettings, loaded } =
    usePersistence([], D_SETTINGS);

  // 雲端資料層:載入覆蓋全域 projects,並提供存/新增/封存。
  const { saveProjectToCloud, insertProjectToCloud, archiveProjectInCloud } =
    useCloudProjects(workspaceId, setProjects);

  // 雲端資料層:載入覆蓋全域 settings(工時/不可用時段),並提供整包儲存。
  const { saveSettingsToCloud } = useCloudWorkspaceSettings(workspaceId, setSettings);

  // 排程要用「每個成員的每日工時 + 休假」算 per-assignee 容量。排程真正跑在這層
  // (quickSchedule / applyTaskDateChange),所以成員清單就在這層取(資料在用到的那層呼叫)。
  const { members } = useWorkspaceMembers(workspaceId);

  // 排程不再每次載入即時算,改讀已落地的 project.schedule。
  // (尚未遷移的舊專案 schedule 欄位不存在,hydrate 會即時 fallback 算一次避免空白。)
  const { sch, miles } = useMemo(() => {
    try { return hydrateSchedule(projects, settings); }
    catch (e) { console.error('hydrate schedule error', e); return { sch: {}, miles: {} }; }
  }, [projects, settings]);

  // 改版前的舊專案(雲端沒存排程)首次載入時自動遷移一次:跑一次排程凍結寫回雲端,使用者無感接軌。
  useMigrateSchedules({ projects, settings, loaded, saveProjectToCloud, setProjects });

  // 快速排程(全域):所有專案「今天以後」的任務共用工時預算一起重排;start < 今天 的任務
  // (含逾期未完成)一律凍結在原日期。把每個有啟動日的專案的排程結果凍結寫回雲端。
  const quickSchedule = useCallback(async () => {
    const today = pD(fmtF(new Date()));
    const frozen = collectFrozen(projects, (entry) => entry.start && entry.start < today);
    const { sch: fresh } = runScheduleV2(projects, settings, { frozen, startFloor: today, members });
    const saved = {};
    for (const project of projects) {
      if (!project.startDate) continue; // 沒有啟動日不能排,略過不動
      const schedule = freezeSchedule(fresh[project.id] || {});
      // 排程沒變就不重寫(避免無謂的版號 bump / 雲端寫入)
      if (JSON.stringify(schedule) === JSON.stringify(project.schedule || {})) continue;
      try {
        const result = await saveProjectToCloud({ ...project, schedule });
        saved[result.id] = result;
      } catch (e) {
        console.error('快速排程儲存失敗', project.id, e);
      }
    }
    if (Object.keys(saved).length > 0) {
      // 用回傳的版號專案覆蓋本地,下一次儲存才不會卡樂觀鎖。
      setProjects((v) => v.map((p) => saved[p.id] || p));
    }
  }, [projects, settings, members, saveProjectToCloud, setProjects]);

  // 改任務日期/工時後落地:
  //   mode='single'      → 只重算這一個任務(其他不動)。
  //   mode='reschedule'  → 這個任務 + 其下游一起重排,本專案非下游 & 其他專案全部凍結。
  const applyTaskDateChange = useCallback(
    async (pid, taskId, changes, mode) => {
      const target = projects.find((p) => p.id === pid);
      if (!target) return;

      // pin/工時/等待覆寫先寫進 tasks(記住),排程另外落地。
      const nextTasks = (target.tasks || []).map((t) => {
        if (t.id !== taskId) return t;
        const nt = { ...t };
        if (changes.pinnedStart) nt.pinnedStart = changes.pinnedStart; else delete nt.pinnedStart;
        if (changes.pinnedHours != null) nt.pinnedHours = changes.pinnedHours; else delete nt.pinnedHours;
        if (changes.pinnedWait != null) nt.pinnedWait = changes.pinnedWait; else delete nt.pinnedWait;
        return nt;
      });

      let next;
      if (mode === 'single') {
        const schedule = { ...(target.schedule || {}) };
        const base = BT.find((b) => b.id === taskId);
        const cur = schedule[taskId];
        const startStr = changes.pinnedStart || cur?.start;
        if (startStr) {
          const hours = changes.pinnedHours != null ? changes.pinnedHours
            : (cur?.hours != null ? cur.hours : (base?.h || 0));
          const wait = changes.pinnedWait != null ? changes.pinnedWait
            : (cur?.w != null ? cur.w : (base?.w || 0));
          // 單人 placer:用該任務 assignee(未指派 → owner)的每日工時 + 休假日鋪這一個任務。
          const availability = availabilityForTask(members, settings, nextTasks, taskId);
          schedule[taskId] = layoutSingleTask(pD(startStr), hours, wait, settings, availability);
        }
        next = { ...target, tasks: nextTasks, schedule };
      } else {
        // reschedule:被改任務 + 下游重排;本專案非下游 + 其他專案全部凍結(其餘不動)。
        const editedProject = { ...target, tasks: nextTasks };
        const runProjects = projects.map((p) => (p.id === pid ? editedProject : p));
        const reflow = collectDownstream(editedProject, taskId);
        const frozen = collectFrozen(runProjects, (entry, tId, project) =>
          (project.id !== pid ? true : !reflow.has(tId)),
        );
        const { sch: fresh } = runScheduleV2(runProjects, settings, { frozen, members });
        next = { ...editedProject, schedule: freezeSchedule(fresh[pid] || {}) };
      }

      const saved = await saveProjectToCloud(next);
      setProjects((v) => v.map((p) => (p.id === saved.id ? saved : p)));
    },
    [projects, settings, members, saveProjectToCloud, setProjects],
  );

  const value = {
    projects, setProjects, settings, setSettings, loaded,
    sch, miles,
    saveProjectToCloud, insertProjectToCloud, archiveProjectInCloud,
    saveSettingsToCloud,
    quickSchedule, applyTaskDateChange,
  };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace 必須在 <WorkspaceProvider> 內使用');
  return ctx;
}
