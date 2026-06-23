import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext.jsx';
import { Login } from '../components/Login/index.jsx';
import { Onboarding } from '../components/Onboarding/index.jsx';
import { Loading } from '../components/Loading.jsx';

// /login:已登入且取過名 → 直接進 App;已登入但還沒名字 → 去取名頁。
export function LoginRoute() {
  const { session, loading, profile, profileStatus } = useAuthContext();
  if (loading || profileStatus === 'loading') return <Loading />;
  if (session) {
    return profile?.display_name
      ? <Navigate to="/dashboard" replace />
      : <Navigate to="/onboarding" replace />;
  }
  return <Login />;
}

// /onboarding:沒登入 → 回登入頁;已取過名 → 不必再取名,進 App。
export function OnboardingRoute() {
  const { session, loading, profile, profileStatus, saveProfile } = useAuthContext();
  if (loading || profileStatus === 'loading') return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.display_name) return <Navigate to="/dashboard" replace />;
  return <Onboarding onDone={saveProfile} />;
}
