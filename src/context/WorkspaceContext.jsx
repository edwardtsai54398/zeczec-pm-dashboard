import { createContext, useContext, useMemo, useCallback } from 'react';
import { runScheduleV2 } from '../lib/schedulerV2.js';
import { D_PROJECTS, D_SETTINGS } from '../constants.js';
import { usePersistence } from '../hooks/usePersistence.js';
import { useCloudProjects } from '../hooks/useCloudProjects.js';
import { useCloudWorkspaceSettings } from '../hooks/useCloudWorkspaceSettings.js';
import { useAuthContext } from './AuthContext.jsx';

const WorkspaceContext = createContext(null);

// 所有頁面共用的資料層:雲端 projects + 全域 settings + 排程結果 + 雲端寫入操作。
export function WorkspaceProvider({ children }) {
  const { workspaceId } = useAuthContext();

  const { projects, setProjects, settings, setSettings, loaded } =
    usePersistence(D_PROJECTS, D_SETTINGS);

  // 雲端資料層:載入覆蓋全域 projects,並提供存/新增/封存。
  const { saveProjectToCloud, insertProjectToCloud, archiveProjectInCloud } =
    useCloudProjects(workspaceId, setProjects);

  // 雲端資料層:載入覆蓋全域 settings(工時/不可用時段),並提供整包儲存。
  const { saveSettingsToCloud } = useCloudWorkspaceSettings(workspaceId, setSettings);

  const { sch, miles } = useMemo(() => {
    try { return runScheduleV2(projects, settings); }
    catch (e) { console.error('schedule error', e); return { sch: {}, miles: {} }; }
  }, [projects, settings]);

  // 甘特圖釘選同樣只改本地 projects。
  const updateTaskPin = useCallback((pid, taskId, { pinnedStart, pinnedHours, pinnedWait }) => {
    setProjects((v) => v.map((p) => {
      if (p.id !== pid) return p;
      return {
        ...p,
        tasks: p.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const next = { ...t };
          if (pinnedStart) next.pinnedStart = pinnedStart; else delete next.pinnedStart;
          if (pinnedHours != null) next.pinnedHours = pinnedHours; else delete next.pinnedHours;
          if (pinnedWait != null) next.pinnedWait = pinnedWait; else delete next.pinnedWait;
          return next;
        }),
      };
    }));
  }, [setProjects]);

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
