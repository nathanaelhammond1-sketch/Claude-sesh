import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './state/store';
import { registerSW } from './sw/register';
import './styles.css';

// Apply the saved theme before first paint is handled in index.html; React takes over from here.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

registerSW();
