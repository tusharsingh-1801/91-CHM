import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './features/advanced-addons.css'
import App from './App.tsx'

const params = new URLSearchParams(window.location.search);
if (import.meta.env.MODE === 'showcase') sessionStorage.setItem('terrascope-showcase', '1');
else if (params.has('demo')) sessionStorage.setItem('terrascope-showcase', params.get('demo') === '1' ? '1' : '0');
if (sessionStorage.getItem('terrascope-showcase') === '1') {
  const { enableShowcase } = await import('./lib/showcase.ts');
  enableShowcase();
  document.documentElement.dataset.showcase = 'true';
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js').catch(()=>{});});
}
