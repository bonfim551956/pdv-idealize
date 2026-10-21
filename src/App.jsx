import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Vendas from './pages/Vendas'
// Depois de uma atualização publicada, os arquivos antigos das telas deixam de existir:
// se uma tela não carregar, recarrega a página uma vez para pegar a versão nova.
const carregar = (f) => lazy(() => f().then((m) => { try { sessionStorage.removeItem('pdv-recarregou') } catch { /* ok */ } return m }).catch((e) => {
  let ja = false
  try { ja = sessionStorage.getItem('pdv-recarregou') === '1'; sessionStorage.setItem('pdv-recarregou', '1') } catch { /* ok */ }
  if (!ja) { window.location.reload(); return new Promise(() => {}) }
  throw e
}))
const NovaVenda = carregar(() => import('./pages/NovaVenda'))
const VendaDetalhe = carregar(() => import('./pages/VendaDetalhe'))
const Produtos = carregar(() => import('./pages/Produtos'))
const ImprimirOS = carregar(() => import('./pages/ImprimirOS'))
const Relatorios = carregar(() => import('./pages/Relatorios'))
const Fechamento = carregar(() => import('./pages/Fechamento'))
const NotaFiscal = carregar(() => import('./pages/NotaFiscal'))
const Usuarios = carregar(() => import('./pages/Usuarios'))
import { Spinner, Alert, Button } from './components/ui'

export default function App() {
  const { session, perfil, carregando, erroPerfil, perm, sair } = useAuth()

  if (carregando) return <div className="grid min-h-screen place-items-center"><Spinner /></div>
  if (!session) return <Login />
  if (!perfil) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
        {erroPerfil ? (
          <Alert>{erroPerfil.code === 'PGRST106' ? 'O schema "pdv" não está exposto na API do Supabase (Settings → Data API → Exposed schemas).' : `Não foi possível carregar seu cadastro: ${erroPerfil.message}`}</Alert>
        ) : <Spinner />}
        <Button variant="secondary" onClick={sair}>Sair</Button>
      </div>
    )
  }

  // Telas carregadas sob demanda: o login e a lista de vendas abrem sem baixar relatórios, impressão etc.
  const carregandoTela = <div className="grid min-h-[40vh] place-items-center"><Spinner /></div>
  return (
    <Suspense fallback={carregandoTela}>
    <Routes>
      <Route path="/vendas/:id/imprimir" element={<ImprimirOS />} />
      <Route
        path="*"
        element={
          <Layout>
            <Suspense fallback={carregandoTela}>
            <Routes>
              <Route path="/" element={<Vendas />} />
              <Route path="/nova-venda" element={<NovaVenda />} />
              <Route path="/vendas/:id" element={<VendaDetalhe />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/fechamento" element={<Fechamento />} />
              <Route path="/produtos" element={perm.produtos ? <Produtos /> : <Navigate to="/" />} />
              <Route path="/nota-fiscal" element={perm.fiscalConfig ? <NotaFiscal /> : <Navigate to="/" />} />
              <Route path="/usuarios" element={perm.usuarios ? <Usuarios /> : <Navigate to="/" />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
            </Suspense>
          </Layout>
        }
      />
    </Routes>
    </Suspense>
  )
}
