import * as Sentry from '@sentry/react';
import { AuthProvider, useAuthContext } from './context/AuthContext.jsx';
import { Login } from './components/Login/index.jsx';
import { Onboarding } from './components/Onboarding/index.jsx';
import ErrorFallback from './components/ErrorFallback.jsx';
import { AppContent } from './views/AppContent/index.jsx';

const Loading = () => (
  <div style={{ padding: 60, textAlign: "center", color: "var(--ink-3)" }}>載入中…</div>
);

//   還在問 Supabase 登入狀態 / 還在查 profile → 載入中
//   沒有 session                           → 登入頁
//   有 session 但 profile 沒名字(新使用者)    → 取名畫面
//   profile 完整                           → 進 App
function Gate() {
  const { session, loading, profile, profileStatus, saveProfile } = useAuthContext();

  if (loading || profileStatus === 'loading') return <Loading />;
  if (!session) return <Login />;
  if (!profile || !profile.display_name) return <Onboarding onDone={saveProfile} />;
  return <AppContent />;
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </Sentry.ErrorBoundary>
  );
}
