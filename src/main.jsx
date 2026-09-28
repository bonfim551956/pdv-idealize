import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import App from './App'
import { AuthProvider } from './lib/auth'
import { CONFIG_FALTANDO } from './lib/supabase'
import { ToastProvider } from './components/ui'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

function ConfigFaltando() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-bold">Falta configurar a conexão com o banco</h1>
      <p className="text-sm text-muted">
        As variáveis <code className="font-semibold text-ink">VITE_SUPABASE_URL</code> e{' '}
        <code className="font-semibold text-ink">VITE_SUPABASE_KEY</code> não foram encontradas neste deploy.
        Cadastre-as na Vercel em Settings → Environment Variables e faça um novo deploy.
      </p>
    </div>
  )
}

const root = ReactDOM.createRoot(document.getElementById('root'))
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

if (!url || !key || !/^https:\/\//.test(url)) {
  root.render(
    <div style={{ maxWidth: 560, margin: '64px auto', padding: 24, fontFamily: 'system-ui', color: '#17232D' }}>
      <h1 style={{ fontSize: 24 }}>Configuração incompleta</h1>
      <p>O PDV não encontrou a conexão com o Supabase. Na Vercel, confira as variáveis
      <b> VITE_SUPABASE_URL</b> (começando com https://) e <b>VITE_SUPABASE_KEY</b>, e faça o Redeploy.</p>
    </div>
  )
} else root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {CONFIG_FALTANDO ? (
        <ConfigFaltando />
      ) : (
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <ToastProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ToastProvider>
          </BrowserRouter>
        </MotionConfig>
      )}
    </ErrorBoundary>
  </React.StrictMode>
)
