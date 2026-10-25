import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import EditorApp from './editor/EditorApp.jsx'

// /editor — редактор плана для организатора, всё остальное — экран посетителя
const isEditor = window.location.pathname.replace(/\/+$/, '').endsWith('/editor')

// Работа без интернета — в собранной версии (npm run build + npm run preview / продакшен)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isEditor ? <EditorApp /> : <App />}
  </StrictMode>,
)
