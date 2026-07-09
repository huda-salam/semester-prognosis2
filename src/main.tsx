import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Support subpath deployment by safely intercepting fetch calls to /api/
const originalFetch = window.fetch;
try {
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function (input: any, init: any) {
      if (typeof input === 'string' && (input.startsWith('/api/') || input.startsWith('api/'))) {
        const base = (import.meta as any).env?.BASE_URL || '/';
        const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
        const targetUrl = input.startsWith('/') ? input : '/' + input;
        return originalFetch(cleanBase + targetUrl, init);
      }
      return originalFetch(input, init);
    }
  });
} catch (e) {
  console.warn('Gagal melakukan override window.fetch secara langsung, menggunakan fallback.', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
