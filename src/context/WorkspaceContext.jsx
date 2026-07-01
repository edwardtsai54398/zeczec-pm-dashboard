import { createContext, useContext, useMemo, useCallback } from 'react';
import { runScheduleV2 } from '../lib/schedulerV2.js';
import { D_SETTINGS } from '../constants.js';
import { usePersistence } from '../hooks/usePersistence.js';
import { useCloudProjects } from '../hooks/useCloudProjects.js';
import { useCloudWorkspaceSettings } from '../hooks/useCloudWorkspaceSettings.js';
import { useAuthContext } from './AuthContext.jsx';

const WorkspaceContext = createContext(null);

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

  const { sch, miles } = useMemo(() => {
    try { return runScheduleV2(projects, settings); }
    catch (e) { console.error('schedule error', e); return { sch: {}, miles: {} }; }
  }, [projects, settings]);

  // 甘特圖釘選：先寫雲端,成功後才覆蓋本地(連帶觸發重算),失敗就維持原狀交給彈窗顯示。
  const updateTaskPin = useCallback(
    async (pid, taskId, { pinnedStart, pinnedHours, pinnedWait }) => {
      const target = projects.find((p) => p.id === pid);
      if (!target) return;
      const nextProject = {
        ...target,
        tasks: target.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const next = { ...t };
          if (pinnedStart) next.pinnedStart = pinnedStart; else delete next.pinnedStart;
          if (pinnedHours != null) next.pinnedHours = pinnedHours; else delete next.pinnedHours;
          if (pinnedWait != null) next.pinnedWait = pinnedWait; else delete next.pinnedWait;
          return next;
        }),
      };
      const saved = await saveProjectToCloud(nextProject);
      // 用回傳的版號專案覆蓋本地,下一次儲存才不會卡樂觀鎖。
      setProjects((v) => v.map((p) => (p.id === saved.id ? saved : p)));
    },
    [projects, saveProjectToCloud, setProjects],
  );

  const value = {
    projects, setProjects, settings, setSettings, loaded,
    sch, miles,
    saveProjectToCloud, insertProjectToCloud, archiveProjectInCloud,
    saveSettingsToCloud,
    updateTaskPin,
  };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace 必須在 <WorkspaceProvider> 內使用');
  return ctx;
}
