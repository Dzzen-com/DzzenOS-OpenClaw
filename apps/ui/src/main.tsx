import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles.css';

const qc = new QueryClient();

function App() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">DzzenOS-OpenClaw UI</h1>
      <p className="mt-2 text-slate-300">
        UI shell placeholder. Next: boards, tasks, run progress.
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
