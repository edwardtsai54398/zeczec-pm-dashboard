import { createContext, useContext, useMemo, useCallback } from 'react';
import { runScheduleV2 } from '../lib/schedulerV2.js';
import {
  hydrateSchedule, freezeSchedule, collectFrozen, collectDownstream, layoutSingleTask,
  preserveCustomTasks,
} from '../lib/scheduleStore.js';
import { BT } from '../lib/tasks.js';
import { pD, fmtF } from '../lib/dateUtils.js';
import { D_SETTINGS, SCHEDULE_START_HOUR } from '../constants.js';
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
      // 自訂任務不進排程器,重算後原封補回,才不會被快速排程洗掉。
      const schedule = preserveCustomTasks(project, freezeSchedule(fresh[project.id] || {}));
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

      const ownerId = members.find((member) => member.role === 'owner')?.user_id ?? null;

      // pin(開始日/時鐘/工時/等待)與負責人覆寫先寫進 tasks(記住),排程另外落地。
      // 用 key 是否存在(`in`)判斷「這次有沒有要改這個欄位」,讓拖拉能只送部分欄位、不誤刪其他釘選;
      // 值為 null/空 = 明確清掉。assignee 等於 owner 就刪(未指派＝owner,比照 ProjectPage)。
      const nextTasks = (target.tasks || []).map((t) => {
        if (t.id !== taskId) return t;
        const nt = { ...t };
        if ('pinnedStart' in changes) { if (changes.pinnedStart) nt.pinnedStart = changes.pinnedStart; else delete nt.pinnedStart; }
        if ('pinnedStartMin' in changes) { if (changes.pinnedStartMin != null) nt.pinnedStartMin = changes.pinnedStartMin; else delete nt.pinnedStartMin; }
        if ('pinnedHours' in changes) { if (changes.pinnedHours != null) nt.pinnedHours = changes.pinnedHours; else delete nt.pinnedHours; }
        if ('pinnedWait' in changes) { if (changes.pinnedWait != null) nt.pinnedWait = changes.pinnedWait; else delete nt.pinnedWait; }
        if ('assignee' in changes) { if (changes.assignee && changes.assignee !== ownerId) nt.assignee = changes.assignee; else delete nt.assignee; }
        return nt;
      });
      const editedTask = nextTasks.find((t) => t.id === taskId);

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
          // 日內開始位移:有釘選時鐘就用它,否則沿用目前排程第一天的 o(避免重算把時鐘打回 10:00)。
          const startOffsetHours = editedTask?.pinnedStartMin != null
            ? editedTask.pinnedStartMin / 60 - SCHEDULE_START_HOUR
            : (cur?.days?.[cur.start]?.o ?? 0);
          // 單人 placer:用該任務 assignee(未指派 → owner)的每日工時 + 休假日鋪這一個任務。
          const availability = availabilityForTask(members, settings, nextTasks, taskId);
          schedule[taskId] = layoutSingleTask(pD(startStr), hours, wait, settings, availability, startOffsetHours);
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
        // 自訂任務不進排程器,重排後原封補回(editedProject.schedule 仍是 target.schedule,含自訂 entry)。
        const schedule = preserveCustomTasks(editedProject, freezeSchedule(fresh[pid] || {}));
        // runScheduleV2 重排時不認時鐘,會把 o 打回 packing 值;把「被改任務本身」第一天的 o
        // 覆寫回它的釘選時鐘,讓使用者手動排定的那一格保留時間(下游被重排就隨排程器)。
        if (editedTask?.pinnedStartMin != null && schedule[taskId]?.days) {
          const rootOffset = editedTask.pinnedStartMin / 60 - SCHEDULE_START_HOUR;
          const firstKey = schedule[taskId].start;
          if (schedule[taskId].days[firstKey]) {
            schedule[taskId] = {
              ...schedule[taskId],
              days: { ...schedule[taskId].days, [firstKey]: { ...schedule[taskId].days[firstKey], o: rootOffset } },
            };
          }
        }
        next = { ...editedProject, schedule };
      }

      const saved = await saveProjectToCloud(next);
      setProjects((v) => v.map((p) => (p.id === saved.id ? saved : p)));
    },
    [projects, settings, members, saveProjectToCloud, setProjects],
  );

  // 使用者在甘特圖手動新增一個自訂任務(不在 BT 模板裡):敘述(名稱/相位)自帶在 project.tasks 那筆,
  // 一律手動排定 → 用單人 placer layoutSingleTask 直接落地,不進排程器。
  const addCustomTask = useCallback(
    async (pid, { name, startDay, startMin, hours, wait, assignee }) => {
      const target = projects.find((p) => p.id === pid);
      if (!target) return;

      const ownerId = members.find((member) => member.role === 'owner')?.user_id ?? null;
      const id = `c${crypto.randomUUID()}`; // c 前綴 uuid:不撞 BT id、不以 .1 結尾(不誤判外包子任務)

      const taskEntry = {
        id, enabled: true, custom: true,
        n: name, p: 'custom',
        // 釘選值一併存起來,雙擊編輯的初值才跟建立時一致、並標示為手動排定。
        pinnedStart: startDay,
        pinnedStartMin: startMin,
        pinnedHours: hours,
      };
      // 未指派 = owner(不寫 assignee),比照 applyTaskDateChange / ProjectPage。
      if (assignee && assignee !== ownerId) taskEntry.assignee = assignee;
      if (wait != null) taskEntry.pinnedWait = wait;

      const nextTasks = [...(target.tasks || []), taskEntry];
      const availability = availabilityForTask(members, settings, nextTasks, id);
      const startOffsetHours = startMin / 60 - SCHEDULE_START_HOUR;
      const landed = layoutSingleTask(pD(startDay), hours, wait || 0, settings, availability, startOffsetHours);
      const next = { ...target, tasks: nextTasks, schedule: { ...(target.schedule || {}), [id]: landed } };

      const saved = await saveProjectToCloud(next);
      setProjects((v) => v.map((p) => (p.id === saved.id ? saved : p)));
    },
    [projects, settings, members, saveProjectToCloud, setProjects],
  );

  // 刪除自訂任務:從 tasks 濾掉、schedule 刪對應落地 entry,存回。
  const removeCustomTask = useCallback(
    async (pid, taskId) => {
      const target = projects.find((p) => p.id === pid);
      if (!target) return;
      const nextTasks = (target.tasks || []).filter((t) => t.id !== taskId);
      const schedule = { ...(target.schedule || {}) };
      delete schedule[taskId];
      const saved = await saveProjectToCloud({ ...target, tasks: nextTasks, schedule });
      setProjects((v) => v.map((p) => (p.id === saved.id ? saved : p)));
    },
    [projects, saveProjectToCloud, setProjects],
  );

  const value = {
    projects, setProjects, settings, setSettings, loaded,
    sch, miles,
    saveProjectToCloud, insertProjectToCloud, archiveProjectInCloud,
    saveSettingsToCloud,
    quickSchedule, applyTaskDateChange, addCustomTask, removeCustomTask,
  };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace 必須在 <WorkspaceProvider> 內使用');
  return ctx;
}
