import { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useProfile } from '../hooks/useProfile.js';
import { useOwnerWorkspace } from '../hooks/useOwnerWorkspace.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { session, loading } = useAuth();
  const { profile, status: profileStatus, saveProfile, preferences, savePreferences } = useProfile(session?.user);

  // Topbar 工作區
  const workspaces = useOwnerWorkspace(session?.user?.id);
  const workspaceId = workspaces[0]?.id ?? null;

  const value = {
    session, loading, profile, profileStatus, saveProfile, preferences, savePreferences,
    workspaces, workspaceId,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext 必須在 <AuthProvider> 內使用');
  return ctx;
}
