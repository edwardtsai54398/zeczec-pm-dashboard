import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { STORAGE_KEY } from '../constants.js';
import { rowToProject, projectToRow } from '../lib/projectMapping.js';

// projects 的雲端資料層。
// 雲端是唯一真相;載入後 setProjects 覆蓋全域,usePersistence 的 effect 會把它寫回 localStorage 當快取。

// 首次空表時,把使用者本地 cfpm4 的專案搬上雲。
// 用 per-workspace flag 防止重複搬移。
async function seedFromLocal(workspaceId) {
  const flagKey = `cfpm4_seeded_${workspaceId}`;
  if (localStorage.getItem(flagKey)) return null;

  let local = null;
  try { local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}
  const localProjects = local?.projects;
  if (!Array.isArray(localProjects) || localProjects.length === 0) return null;

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const payload = localProjects.map((p, i) => ({
    workspace_id: workspaceId,
    ...projectToRow({ ...p, position: i }),
    version: 0,
    created_by: userId,
    updated_by: userId,
  }));

  const { data, error } = await supabase.from('projects').insert(payload).select();
  if (error) { console.error('搬移本地專案上雲失敗', error); return null; }
  localStorage.setItem(flagKey, '1');
  return (data ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export function useCloudProjects(workspaceId, setProjects) {
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_archived', false)
        .order('position');
      if (cancelled) return;
      if (error) { console.error('查專案失敗', error); return; }

      let rows = data ?? [];
      if (rows.length === 0) {
        const seeded = await seedFromLocal(workspaceId);
        if (cancelled) return;
        if (seeded) rows = seeded;
      }
      if (rows.length === 0) return; // 雲端與本地都沒有 → 不覆蓋全域預設
      setProjects(rows.map(rowToProject));
    })();

    return () => { cancelled = true; };
  }, [workspaceId, setProjects]);

  // 儲存單一專案。version 樂觀鎖:只在版本相符時更新。
  const saveProjectToCloud = useCallback(async (p) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase
      .from('projects')
      .update({
        ...projectToRow(p),
        version: (p.version ?? 0) + 1,
        updated_at: new Date().toISOString(),
        updated_by: session?.user?.id,
      })
      .eq('id', p.id)
      .eq('version', p.version ?? 0)
      .select()
      .single();
    if (error) {
      // PGRST116 = 0 列符合 → 版本已被別人推進
      if (error.code === 'PGRST116') throw new Error('資料已被更新，請重新整理後再儲存');
      throw error;
    }
    return rowToProject(data);
  }, []);

  // 新增即寫入雲端,拿回真正的 uuid 後再回前端。
  const insertProjectToCloud = useCallback(async (p) => {
    if (!workspaceId) throw new Error('尚未取得工作區');
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    const { data, error } = await supabase
      .from('projects')
      .insert({
        workspace_id: workspaceId,
        ...projectToRow(p),
        version: 0,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToProject(data);
  }, [workspaceId]);

  // 封存
  const archiveProjectInCloud = useCallback(async (id) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase
      .from('projects')
      .update({
        is_archived: true,
        updated_at: new Date().toISOString(),
        updated_by: session?.user?.id,
      })
      .eq('id', id);
    if (error) throw error;
  }, []);

  return { saveProjectToCloud, insertProjectToCloud, archiveProjectInCloud };
}
