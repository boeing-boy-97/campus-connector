import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfigurationError } from './components/ConfigurationError';
import { isFirebaseConfigured, missingConfigKeys } from './services/firebase';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Do not burn retries on errors that will never succeed (a permission
      // problem or a missing index needs a fix, not another attempt).
      retry: (failureCount, error) => {
        if (error instanceof FirebaseError) {
          const terminal = [
            'permission-denied',
            'functions/permission-denied',
            'unauthenticated',
            'functions/unauthenticated',
            'failed-precondition',
            'functions/invalid-argument',
          ];
          if (terminal.includes(error.code)) return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing from index.html.');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    {isFirebaseConfigured ? (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ErrorBoundary>
    ) : (
      <ConfigurationError missingKeys={missingConfigKeys} />
    )}
  </React.StrictMode>
);
