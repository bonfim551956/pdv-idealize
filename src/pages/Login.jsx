import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/supabase'
import { Button, Field, Input, Alert } from '../components/ui'

export default function Login() {
  const { entrar } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErro(null)
    if (!usuario.trim() || !senha) { setErro('Informe usuário e senha.'); return }
    setEnviando(true)
    try { await entrar(usuario, senha) } catch (err) { setErro(mensagemErro(err)) } finally { setEnviando(false) }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-end bg-brand p-12 text-surface md:flex">
        <svg width="160" height="80" viewBox="0 0 40 20" aria-hidden className="mb-8">
          <circle cx="10" cy="10" r="8" fill="none" stroke="#FAFAFA" strokeWidth="1.5" />
          <circle cx="30" cy="10" r="8" fill="none" stroke="#E7C3A3" strokeWidth="1.5" />
          <path d="M18 9 Q20 6 22 9" fill="none" stroke="#FAFAFA" strokeWidth="1" />
        </svg>
        <p className="text-2xl font-bold">Óticas Idealize</p>
        <p className="mt-2 max-w-sm text-base text-surface/80">Vendas, ordens de serviço e recebimentos das lojas em um só lugar.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-6" noValidate>
          <div>
            <h1 className="text-xl font-bold">Entrar no PDV</h1>
            <p className="mt-1 text-sm text-muted">Use o usuário e a senha que o administrador cadastrou para você.</p>
          </div>
          {erro && <Alert>{erro}</Alert>}
          <Field label="Usuário">
            {({ id }) => <Input id={id} autoComplete="username" autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="ex.: mariana.rosa" />}
          </Field>
          <Field label="Senha">
            {({ id }) => <Input id={id} type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />}
          </Field>
          <Button type="submit" loading={enviando} className="w-full">Entrar</Button>
        </form>
      </div>
    </div>
  )
}
