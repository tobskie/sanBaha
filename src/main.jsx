import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './App.css'
import App from './App.jsx'
import MobileSimulator from './MobileSimulator.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { AdminProvider } from './contexts/AdminContext.jsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Show the phone simulator only on desktop (width > 768px).
// On real mobile devices and when installed as a PWA, render the app directly.
const isMobile = window.matchMedia('(max-width: 768px)').matches
  || window.navigator.standalone   // iOS "Add to Home Screen"
  || window.matchMedia('(display-mode: standalone)').matches;  // Android PWA

const Root = isMobile ? App : MobileSimulator;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AdminProvider>
          <Root />
        </AdminProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
