import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Stops the browser offering saved addresses and other form suggestions in the number and datasheet fields (several come from engineering-ui).
document.addEventListener('focusin', e => {
  const t = e.target;
  if ((t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) && t.autocomplete !== 'off') t.autocomplete = 'off';
});

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
