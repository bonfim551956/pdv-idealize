import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, usuarioParaEmail } from './supabase'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erroPerfil, setErroPerfil] = useState(null)

  const carregarPerfil = useCallback(async (s) => {
    if (!s) { setPerfil(null); return }
    const { data, error } = await supabase
      .from('colaboradores')
      .select('id, nome, usuario, cargo, loja_id, loja:lojas(id, nome, cidade, empresa_id)')
      .eq('auth_user_id', s.user.id)
      .maybeSingle()
    setErroPerfil(error || (!data ? { message: 'Login sem colaborador vinculado.' } : null))
    setPerfil(data || null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await carregarPerfil(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setTimeout(() => carregarPerfil(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [carregarPerfil])

  const entrar = async (usuario, senha) => {
    const { error } = await supabase.auth.signInWithPassword({ email: usuarioParaEmail(usuario), password: senha })
    if (error) throw error
  }
  const sair = () => supabase.auth.signOut()
  const isAdmin = perfil?.cargo === 'admin'

  return (
    <AuthCtx.Provider value={{ session, perfil, isAdmin, carregando, erroPerfil, entrar, sair }}>
      {children}
    </AuthCtx.Provider>
  )
}
