import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { STORAGE_KEY, DEFAULT_WORKSPACE_SETTINGS } from '../constants.js';

// workspace 設定(每日工時預設 hoursPerDay)的雲端資料層。全域 blackout 已移除,改由每位成員各自設休假。
// 雲端是唯一真相;載入後 setSettings 覆蓋全域,usePersistence 的 effect 會寫回 localStorage 當快取。
// workspace 單人擁有、設定變動頻率低,儲存不加 version 樂觀鎖(與 projects 不同)。

// 讀本地 cfpm4 的 settings(現有使用者搬上雲前的工時/不可用時段)。
function readLocalSettings() {
  try {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return local?.settings ?? null;
  } catch (e) {
    return null;
  }
}

// 首次:雲端還是預設值、但本地有自訂時,把本地搬上雲,避免新接雲端後設定回退成預設。
// 用 per-workspace flag 防重複搬移。回傳要採用的 settings(搬移後是本地值,否則 null)。
async function seedFromLocal(workspaceId, cloudSettings) {
  const flagKey = `cfpm4_settings_seeded_${workspaceId}`;
  if (localStorage.getItem(flagKey)) return null;

  const cloudIsDefault =
    JSON.stringify(cloudSettings ?? {}) === JSON.stringify(DEFAULT_WORKSPACE_SETTINGS);
  const local = readLocalSettings();
  const localIsCustom =
    local && JSON.stringify(local) !== JSON.stringify(DEFAULT_WORKSPACE_SETTINGS);

  if (!cloudIsDefault || !localIsCustom) return null;

  const merged = { ...DEFAULT_WORKSPACE_SETTINGS, ...local };
  const { error } = await supabase
    .from('workspaces')
    .update({ settings: merged })
    .eq('id', workspaceId);
  if (error) { console.error('搬移本地設定上雲失敗', error); return null; }
  localStorage.setItem(flagKey, '1');
  return merged;
}

export function useCloudWorkspaceSettings(workspaceId, setSettings) {
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single();
      if (cancelled) return;
      if (error) { console.error('查工作區設定失敗', error); return; }

      let settings = data?.settings ?? null;
      const seeded = await seedFromLocal(workspaceId, settings);
      if (cancelled) return;
      if (seeded) settings = seeded;

      if (settings) setSettings({ ...DEFAULT_WORKSPACE_SETTINGS, ...settings });
    })();

    return () => { cancelled = true; };
  }, [workspaceId, setSettings]);

  // 儲存整包 settings(呼叫端合併好 hoursPerDay 再傳進來,避免共欄互蓋)。
  const saveSettingsToCloud = useCallback(async (next) => {
    if (!workspaceId) throw new Error('尚未取得工作區');
    const { error } = await supabase
      .from('workspaces')
      .update({ settings: next })
      .eq('id', workspaceId);
    if (error) throw error;
    setSettings(next);
    return next;
  }, [workspaceId, setSettings]);

  return { saveSettingsToCloud };
}
