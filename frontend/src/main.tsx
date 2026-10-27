import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './features/advanced-addons.css'
import App from './App.tsx'

// Always use the live API. Legacy demo URL/session flags must not inject fictional data.
sessionStorage.removeItem('terrascope-showcase')
delete document.documentElement.dataset.showcase

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
