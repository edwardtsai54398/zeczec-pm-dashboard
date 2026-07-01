import { useCallback } from 'react';
import { useAuthContext } from '../context/AuthContext.jsx';
import { can } from '../lib/permissions.js';

// UI 層唯一的權限入口:const { can } = usePermissions(); can('editKOL') → boolean。
// 角色取自 AuthContext 的「當前工作區」,切換工作區後自動更新。
export function usePermissions() {
  const { role } = useAuthContext();
  const check = useCallback((capability) => can(role, capability), [role]);
  return { can: check, role };
}
