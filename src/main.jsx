import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Service worker: registra só em produção. Em dev, o SW cacheia os módulos do
// Vite com hash antigo e, após re-otimização de deps, serve uma cópia stale do
// React → "Cannot read properties of null (reading 'useState')". Por isso, em
// dev, desregistramos qualquer SW e limpamos os caches para auto-curar o browser.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
  } else {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
    if ('caches' in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k)))
  }
}
