import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { DbProvider } from './context/DbContext';
import { StoreProvider } from './store';

// Global handler to suppress benign WebSocket / HMR disconnection warnings in dev/cloud iframe environments
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = String(reason?.message || reason || '');
    if (
      msg.includes('WebSocket') ||
      msg.includes('websocket') ||
      msg.includes('failed to connect') ||
      msg.includes('closed without opened')
    ) {
      event.preventDefault(); // Suppress noisy unhandled rejection from dev websocket
    }
  });

  window.addEventListener('error', (event) => {
    const msg = String(event.message || '');
    if (
      msg.includes('WebSocket') ||
      msg.includes('websocket') ||
      msg.includes('failed to connect') ||
      msg.includes('closed without opened')
    ) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DbProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </DbProvider>
  </StrictMode>,
);
