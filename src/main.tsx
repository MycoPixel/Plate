import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/instrument-sans'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('./sw.js')
      .then(async (reg) => {
        await navigator.serviceWorker.ready
        const seen = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => !u.includes('/icons/'))
        reg.active?.postMessage({ type: 'cache', urls: [location.href.split('#')[0], ...seen] })
      })
      .catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
