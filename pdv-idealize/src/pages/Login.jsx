import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/supabase'
import { Button, Field, Input, Alert } from '../components/ui'
import { Logo } from '../components/Layout'

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
      <div className="relative hidden overflow-hidden bg-brand-deep p-12 text-surface md:flex md:flex-col md:justify-between">
        {/* Faixa laranja: o traço vertical da logo, em escala de parede */}
        <span className="absolute -right-10 top-0 h-full w-24 -skew-x-6 bg-accent" aria-hidden />
        <span className="absolute -right-10 top-0 h-full w-40 -skew-x-6 bg-brand-bright/20" aria-hidden style={{ right: '64px' }} />
        <Logo branca className="relative w-64" />
        <div className="relative max-w-sm">
          <p className="font-display text-2xl font-bold">Ponto de venda</p>
          <p className="mt-2 text-base text-surface/80">Vendas, ordens de serviço e recebimentos de todas as lojas em um só lugar.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-6" noValidate>
          <Logo className="w-48 md:hidden" />
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
