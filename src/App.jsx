import * as Sentry from '@sentry/react';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ErrorFallback from './components/ErrorFallback.jsx';
import { router } from './router.jsx';

// 登入/取名/換頁全部交給 router;auth 狀態仍由 AuthProvider 提供,
// 各路由(ProtectedLayout / LoginRoute / OnboardingRoute)自己讀 context 決定要不要跳轉。
export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </Sentry.ErrorBoundary>
  );
}
