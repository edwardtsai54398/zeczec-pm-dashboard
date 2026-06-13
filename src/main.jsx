import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import * as Sentry from "@sentry/react";


if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.5,
  });
}

const app = document.getElementById('root');
const root = createRoot(app, {
  // Callback called when an error is thrown and not caught by an ErrorBoundary.
  onUncaughtError: import.meta.env.PROD ? Sentry.reactErrorHandler((error, errorInfo) => {
    console.warn('Uncaught error', error, errorInfo.componentStack);
  }) : undefined,
  // Callback called when React catches an error in an ErrorBoundary.
  onCaughtError: import.meta.env.PROD ? Sentry.reactErrorHandler() : undefined,
  // Callback called when React automatically recovers from errors.
  onRecoverableError: import.meta.env.PROD ? Sentry.reactErrorHandler() : undefined,
});

root.render(<App />)
