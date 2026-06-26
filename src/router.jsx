import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './views/ProtectedLayout.jsx';
import { LoginRoute, OnboardingRoute } from './views/AuthRoutes.jsx';
import { Dashboard } from './views/AppContent/Dashboard/index.jsx';
import { Gantt } from './views/AppContent/Gantt/index.jsx';
import { KOLPage } from './views/AppContent/KOLPage/index.jsx';
import { SettingsPage } from './views/AppContent/SettingsPage/index.jsx';
import { ProjectPage } from './views/AppContent/ProjectPage/index.jsx';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginRoute /> },
  { path: '/onboarding', element: <OnboardingRoute /> },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'gantt', element: <Gantt /> },
      { path: 'project', element: <ProjectPage /> },
      { path: 'project/new', element: <ProjectPage isNew /> },
      { path: 'project/:id', element: <ProjectPage /> },
      { path: 'kol', element: <KOLPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  // 未知路徑導回首頁。
  { path: '*', element: <Navigate to="/" replace /> },
]);
