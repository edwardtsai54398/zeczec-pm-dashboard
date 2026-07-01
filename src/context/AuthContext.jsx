import { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useProfile } from '../hooks/useProfile.js';
import { useMemberWorkspaces } from '../hooks/useMemberWorkspaces.js';
import { readActiveWorkspaceId, writeActiveWorkspaceId } from '../lib/preference.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { session, loading } = useAuth();
  const { profile, status: profileStatus, saveProfile: saveProfileRaw, preferences, savePreferences } = useProfile(session?.user);

  // Topbar 工作區:登入者所屬的全部工作區(含 role)。
  const { workspaces, refetchWorkspaces } = useMemberWorkspaces(session?.user?.id);

  // onboarding 取名會在雲端新建工作區,但 userId 沒變、useMemberWorkspaces 不會自己重抓,
  // 因此建完後主動重抓一次,新工作區名稱才會立刻出現在 Topbar,不用等使用者重整。
  const saveProfile = useCallback(async (displayName) => {
    await saveProfileRaw(displayName);
    refetchWorkspaces();
  }, [saveProfileRaw, refetchWorkspaces]);

  // 目前選到的工作區。初值從 localStorage 取,重整後沿用上次選的。
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => readActiveWorkspaceId());

  // 選到的若已不在清單(被移除 / 換帳號 / 尚未載入)就退回第一個。
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? null;
  const workspaceId = activeWorkspace?.id ?? null;
  const role = activeWorkspace?.role ?? null;

  const selectWorkspace = useCallback((id) => {
    setActiveWorkspaceId(id);
    writeActiveWorkspaceId(id);
  }, []);

  const value = {
    session, loading, profile, profileStatus, saveProfile, preferences, savePreferences,
    workspaces, workspaceId, role, selectWorkspace,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext 必須在 <AuthProvider> 內使用');
  return ctx;
}
