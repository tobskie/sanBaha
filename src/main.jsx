import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './App.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { AdminProvider } from './contexts/AdminContext.jsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const Root = App;

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
