import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) {
  console.error('Root element #root not found — check index.html')
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (err) {
    console.error('Failed to mount React app:', err)
    // Fallback render without React if mount itself crashes
    rootEl.innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;background:#244c43;color:#f6f5f0;font-family:system-ui;padding:24px;text-align:center;">
        <div>
          <div style="width:48px;height:48px;border-radius:14px;background:#d8ee6c;display:grid;place-items:center;font:bold 29px Georgia,serif;color:#244c43;margin:0 auto 16px;">C</div>
          <h2 style="margin:0 0 8px;">Something went wrong</h2>
          <p style="opacity:0.85;max-width:520px;margin:0 auto 16px;">The app failed to start. Check browser console for details. If this is production, ensure VITE_FIREBASE_* env vars are set in Vercel.</p>
          <pre style="background:#1b332e;padding:12px;border-radius:8px;max-width:600px;overflow:auto;text-align:left;font-size:12px;">${err instanceof Error ? err.message : String(err)}</pre>
          <button onclick="location.reload()" style="margin-top:16px;padding:10px 18px;border-radius:10px;border:none;background:#d8ee6c;color:#244c43;font-weight:600;cursor:pointer;">Reload</button>
        </div>
      </div>
    `
  }
}

// Global error handlers — helps surface blank-screen crashes in production
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error || e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason)
})
