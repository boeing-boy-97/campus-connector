import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfigurationError } from './components/ConfigurationError';
import { isFirebaseConfigured, missingConfigKeys } from './services/firebase';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing from index.html.');
}

const root = createRoot(container);

/**
 * A build without Firebase configuration cannot work, so render an explicit,
 * actionable configuration screen instead of mounting an app that would throw
 * on its first Firebase call.
 */
root.render(
  <StrictMode>
    {isFirebaseConfigured ? (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ) : (
      <ConfigurationError missingKeys={missingConfigKeys} />
    )}
  </StrictMode>,
);
