import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './views/ProtectedLayout.jsx';
import { LoginRoute, OnboardingRoute } from './views/AuthRoutes.jsx';
import { DashboardRoute, GanttRoute, KOLRoute, SettingsRoute } from './views/AppContent/routes.jsx';
import { ProjectPage } from './views/AppContent/ProjectPage.jsx';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginRoute /> },
  { path: '/onboarding', element: <OnboardingRoute /> },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardRoute /> },
      { path: 'gantt', element: <GanttRoute /> },
      { path: 'project', element: <ProjectPage /> },
      { path: 'project/new', element: <ProjectPage isNew /> },
      { path: 'project/:id', element: <ProjectPage /> },
      { path: 'kol', element: <KOLRoute /> },
      { path: 'settings', element: <SettingsRoute /> },
    ],
  },
  // 未知路徑導回首頁。
  { path: '*', element: <Navigate to="/" replace /> },
]);
