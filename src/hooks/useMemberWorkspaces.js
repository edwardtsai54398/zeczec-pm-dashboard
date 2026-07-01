import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// 查登入者所屬的「所有」工作區(不限 owner),並帶回自己在每個工作區的 role,
// 給權限站點與 Topbar 切換器使用。由 AuthContext 層呼叫。
export function useMemberWorkspaces(userId) {
  const [workspaces, setWorkspaces] = useState([]);
  // 重抓計數:onboarding 剛建好工作區時 userId 沒變、effect 不會重跑,
  // 靠 AuthContext 主動 +1 觸發重抓,新工作區才不用等重整就出現。
  const [reloadToken, setReloadToken] = useState(0);

  const refetchWorkspaces = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!userId) { setWorkspaces([]); return; }

    // 換頁 / 卸載時丟棄這次查詢結果,避免蓋掉新狀態
    let cancelled = false;

    (async () => {
      // 內嵌:workspace_members.workspace_id 有 FK 指向 workspaces,
      // 一次 select 就把關聯的工作區帶回,連同自己這列的 role。
      const { data, error } = await supabase
        .from('workspace_members')
        .select('role, workspaces(id, name)')
        .eq('user_id', userId);

      if (cancelled) return;
      if (error) { console.error('查工作區失敗', error); return; }

      // 內嵌結果是 [{ role, workspaces: {...} }, ...],攤平成帶 role 的工作區物件陣列。
      setWorkspaces((data ?? [])
        .filter((row) => row.workspaces)
        .map((row) => ({ ...row.workspaces, role: row.role })));
    })();

    return () => { cancelled = true; };
  }, [userId, reloadToken]);

  return { workspaces, refetchWorkspaces };
}
