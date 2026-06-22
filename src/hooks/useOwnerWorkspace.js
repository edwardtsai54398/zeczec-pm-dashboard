import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export function useOwnerWorkspace() {
  const [workspaces, setWorkspaces] = useState([]);
  
  useEffect(() => {
    // 換頁 / 卸載時丟棄這次查詢結果,避免蓋掉新狀態
    let cancelled = false;
    
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (cancelled || !userId) return; // 沒人登入就不查
      
      // 內嵌:workspace_members.workspace_id 有 FK 指向 workspaces
      // 一次 select 就把關聯的工作區帶回,免得再發第二個查詢。
      const { data, error } = await supabase
        .from('workspace_members')
        .select('workspaces(id, name)')
        .eq('user_id', userId)
        .eq('role', 'owner');

      if (cancelled) return;
      if (error) { console.error('查工作區失敗', error); return; }
      
      // 內嵌結果是 [{ workspaces: {...} }, ...],攤平成工作區物件陣列給 UI 層
      setWorkspaces((data ?? []).map((row) => row.workspaces).filter(Boolean));
    })();

    return () => { cancelled = true; };
  }, []);

  return workspaces;
}
