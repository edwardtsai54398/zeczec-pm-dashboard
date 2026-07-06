import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// 列出當前工作區的全部成員(含 display_name / email / role),給設定頁「工作區成員」區塊。
// 走 list_workspace_members RPC:workspace_members / profiles 的 RLS 都只放行「自己那列」,
// 直接 client 查會被擋,只能靠 SECURITY DEFINER 函式繞過(函式內先自驗是成員)。
// 結構比照 useMemberWorkspaces:cancelled 旗標丟棄過期查詢,reloadToken 供外部刷新。
export function useWorkspaceMembers(workspaceId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!workspaceId) { setMembers([]); return; }

    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      const { data, error: rpcError } = await supabase.rpc('list_workspace_members', {
        p_workspace_id: workspaceId,
      });
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setMembers([]);
      } else {
        setMembers(data ?? []);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [workspaceId, reloadToken]);

  return { members, loading, error, refetch };
}

// 新增成員:呼叫 SECURITY DEFINER RPC。後端會驗證呼叫者在該工作區是 owner、
// 用 email 找出對應使用者再寫入 workspace_members,避免從 client 直接讀 profiles 列舉 email。
// 失敗訊息(例如「該 email 尚未註冊」)由 RPC 拋出,直接顯示在彈窗。
export async function addWorkspaceMember(workspaceId, email, role) {
  const { error } = await supabase.rpc('add_workspace_member', {
    p_workspace_id: workspaceId,
    p_email: email,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

// 踢除成員:RPC 內自驗 owner、不能踢自己。失敗訊息由 RPC 拋出。
export async function removeWorkspaceMember(workspaceId, userId) {
  const { error } = await supabase.rpc('remove_workspace_member', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

// 變更成員角色:RPC 內自驗 owner、角色限三值、不能改自己。失敗訊息由 RPC 拋出。
export async function updateWorkspaceMemberRole(workspaceId, userId, role) {
  const { error } = await supabase.rpc('update_workspace_member_role', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

// 設定「自己的」可用性(每日工時 + 個人休假):存進自己那筆成員 settings jsonb。
// 可用性是描述本人的資料,不綁角色——任何成員都能改自己的,但誰都不能改別人的,
// 所以 RPC 內鎖定 auth.uid() 那列(不再收 userId)。dailyHours 傳 null = 回退預設;
// daysOff 是範圍陣列 [{id,name,start,end}]。失敗訊息由 RPC 拋出。
export async function updateMyAvailability(workspaceId, dailyHours, daysOff) {
  const { error } = await supabase.rpc('update_workspace_member_settings', {
    p_workspace_id: workspaceId,
    p_settings: { daily_hours: dailyHours, days_off: daysOff },
  });
  if (error) throw new Error(error.message);
}
