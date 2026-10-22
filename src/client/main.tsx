import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { sync } from './lib/store.ts';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void sync();
if ('serviceWorker' in navigator && import.meta.env.PROD)
  void navigator.serviceWorker.register('/sw.js');
