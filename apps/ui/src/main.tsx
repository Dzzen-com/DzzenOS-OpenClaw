import React from 'react';
import ReactDOM from 'react-dom/client';
import { MobileNavProvider } from './state/mobile-nav';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles.css';
import './i18n';
import { App } from './app/App';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <MobileNavProvider>
        <App />
      </MobileNavProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
