import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { TWEAK_DEFAULTS, ACCENT_PALETTES } from '../constants.js';
import { useAuthContext } from '../context/AuthContext.jsx';
import { WorkspaceProvider, useWorkspace } from '../context/WorkspaceContext.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle } from '../tweaks-panel.jsx';
import { useTheme } from '../hooks/useTheme.js';
import Rail from '../components/Rail.jsx';
import Topbar from '../components/Topbar/index.jsx';
import Report from '../components/Report/Report.jsx';
import Loading from '../components/Loading.jsx';

function AppShell() {
  const { projects, loaded } = useWorkspace();
  const [t, setT] = useTweaks(TWEAK_DEFAULTS);
  const location = useLocation();
  const view = location.pathname.split('/')[1] || 'dashboard';

  useTheme(t);

  return (
    <div className="app" data-screen-label={'00 ' + view}>
      <Rail />

      <main className="main">
        <Topbar projectCount={projects.length} showAvatar={t.showAvatar} />
        {loaded ? <Outlet /> : <Loading />}
      </main>

      <TweaksPanel title="Tweaks" defaultOpen={false}>
        <TweakSection title="外觀">
          <TweakColor label="主色調" value={t.accent}
            onChange={(v) => setT('accent', v)} options={ACCENT_PALETTES} />
          <TweakRadio label="密度" value={t.density}
            onChange={(v) => setT('density', v)}
            options={[{ label: '舒適', value: 'comfortable' }, { label: '緊湊', value: 'compact' }]} />
          <TweakToggle label="背景漸層光暈" value={t.ambient} onChange={(v) => setT('ambient', v)} />
          <TweakToggle label="顯示頭像" value={t.showAvatar} onChange={(v) => setT('showAvatar', v)} />
        </TweakSection>
      </TweaksPanel>

      <Report view={view} />
    </div>
  );
}

export default function ProtectedLayout() {
  const { session, loading, profile, profileStatus } = useAuthContext();

  // 還在問登入狀態 / 查 profile → 先別決定要不要跳轉,避免閃一下登入頁。
  if (loading || profileStatus === 'loading') return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile || !profile.display_name) return <Navigate to="/onboarding" replace />;

  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  );
}
