import { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useProfile } from '../hooks/useProfile.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { session, loading } = useAuth();
  const { profile, status: profileStatus, saveProfile, preferences, updatePreference } = useProfile(session?.user);

  const value = { session, loading, profile, profileStatus, saveProfile, preferences, updatePreference };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext 必須在 <AuthProvider> 內使用');
  return ctx;
}
