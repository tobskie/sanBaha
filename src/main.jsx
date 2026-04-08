import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './App.css'
import MobileSimulator from './MobileSimulator.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { AdminProvider } from './contexts/AdminContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AdminProvider>
          <MobileSimulator />
        </AdminProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
