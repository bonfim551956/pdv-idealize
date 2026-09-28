import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Vendas from './pages/Vendas'
import NovaVenda from './pages/NovaVenda'
import VendaDetalhe from './pages/VendaDetalhe'
import Produtos from './pages/Produtos'
import { Spinner, Alert, Button } from './components/ui'

export default function App() {
  const { session, perfil, carregando, erroPerfil, isAdmin, sair } = useAuth()

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

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Vendas />} />
        <Route path="/nova-venda" element={<NovaVenda />} />
        <Route path="/vendas/:id" element={<VendaDetalhe />} />
        <Route path="/produtos" element={isAdmin ? <Produtos /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}
