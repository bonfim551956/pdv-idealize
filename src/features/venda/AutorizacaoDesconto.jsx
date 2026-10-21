import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, KeyRound, Send, Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal, Field, Input, Button, Alert, cx } from '../../components/ui'

/*
  Desconto acima do limite do consultor. Duas formas, as duas pelo cadastro do gerente
  (Administrativo da própria loja, Supervisão ou Diretor):
  1. Senha aqui: o gerente digita o usuário e a senha dele nesta tela (a senha vai direto ao servidor e não fica guardada).
  2. Pelo usuário do gerente: o pedido aparece na tela do gerente, que aprova ou recusa de onde estiver.
*/
const pctTxt = (v) => String(v ?? '').replace('.', ',')

function PorSenha({ pct, onAutorizado, onFechar }) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const autorizar = async (e) => {
    e.preventDefault()
    if (!usuario.trim() || !senha) { setErro('Informe usuário e senha do gerente.'); return }
    setEnviando(true); setErro(null)
    const { data, error } = await supabase.functions.invoke('autorizar-desconto', { body: { usuario, senha, pct } }).catch((x) => ({ error: x }))
    setEnviando(false)
    setSenha('')
    if (error || !data) { setErro('Não foi possível conferir a autorização agora. Tente de novo.'); return }
    if (data.erro) { setErro(data.erro); return }
    onAutorizado(data)
  }

  return (
    <form onSubmit={autorizar} className="flex flex-col gap-4" noValidate autoComplete="off">
      {erro && <Alert>{erro}</Alert>}
      <Field label="Usuário do gerente" required>
        {({ id }) => <Input id={id} value={usuario} onChange={(e) => setUsuario(e.target.value)} autoCapitalize="none" autoComplete="off" autoFocus />}
      </Field>
      <Field label="Senha do gerente" required>
        {({ id }) => <Input id={id} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar}>Voltar</Button>
        <Button type="submit" icon={ShieldCheck} loading={enviando}>Autorizar desconto</Button>
      </div>
    </form>
  )
}

function PeloGerente({ pct, total, cliente, onAutorizado, onFechar }) {
  const [pedido, setPedido] = useState(null) // id da solicitação
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const timer = useRef(null)
  const pendente = useRef(null)
  // fechou a janela com o pedido em aberto: cancela para não ficar pendurado na tela do gerente
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (pendente.current) supabase.rpc('cancelar_solicitacao_desconto', { p_id: pendente.current })
  }, [])

  const acompanhar = (id) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const { data } = await supabase.from('solicitacoes_desconto')
        .select('status, pct, autorizacao_id, gerente:colaboradores!solicitacoes_desconto_gerente_id_fkey(nome)').eq('id', id).maybeSingle()
      if (data?.status && data.status !== 'pendente') pendente.current = null
      if (data?.status === 'aprovada') { onAutorizado({ autorizacao_id: data.autorizacao_id, gerente: data.gerente?.nome || 'Gerente', pct: Number(data.pct) }); return }
      if (data?.status === 'recusada') { setPedido(null); setErro(`${data.gerente?.nome?.split(' ')[0] || 'O gerente'} recusou o desconto de ${pctTxt(data.pct)}%.`); return }
      if (data?.status === 'expirada') { setPedido(null); setErro('O pedido expirou sem resposta. Envie de novo.'); return }
      if (data?.status === 'cancelada') { setPedido(null); return }
      acompanhar(id)
    }, 3000)
  }

  const enviar = async () => {
    setEnviando(true); setErro(null)
    const { data, error } = await supabase.rpc('solicitar_desconto', { p_pct: pct, p_total: total, p_cliente: cliente || '' })
    setEnviando(false)
    if (error) { setErro(error.message || 'Não foi possível enviar o pedido agora.'); return }
    setPedido(data); pendente.current = data
    acompanhar(data)
  }

  const cancelar = async () => {
    clearTimeout(timer.current)
    pendente.current = null
    if (pedido) await supabase.rpc('cancelar_solicitacao_desconto', { p_id: pedido })
    setPedido(null)
  }

  if (pedido) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-md bg-brand-soft p-4 text-sm text-brand" role="status" aria-live="polite">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <p><b>Pedido enviado.</b> Aguardando o gerente aprovar pelo usuário dele. Assim que ele aprovar, a venda segue sozinha.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" icon={X} onClick={cancelar}>Cancelar pedido</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {erro && <Alert>{erro}</Alert>}
      <p className="text-sm text-muted">O pedido aparece na tela do gerente da loja (ou da supervisão e diretoria), que aprova ou recusa pelo próprio usuário.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar}>Voltar</Button>
        <Button type="button" icon={Send} loading={enviando} onClick={enviar}>Enviar pedido ao gerente</Button>
      </div>
    </div>
  )
}

export default function AutorizacaoDesconto({ aberto, pct, limite, total, cliente, onFechar, onAutorizado }) {
  const [modo, setModo] = useState('senha')
  useEffect(() => { if (aberto) setModo('senha') }, [aberto])

  const opcoes = [
    { v: 'senha', label: 'Senha do gerente aqui', icon: KeyRound },
    { v: 'pedido', label: 'Aprovação pelo usuário do gerente', icon: Send },
  ]
  return (
    <Modal open={aberto} onOpenChange={(v) => !v && onFechar()} title="Autorização do gerente">
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>O desconto de <b className="num">{pctTxt(pct)}%</b> passa do seu limite de <b className="num">{pctTxt(limite)}%</b> e precisa da autorização do gerente.</span>
        </p>
        <div role="radiogroup" aria-label="Como o gerente vai autorizar" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {opcoes.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={modo === o.v} onClick={() => setModo(o.v)}
              className={cx('flex items-center gap-2 rounded-md border-2 px-3 py-2 text-left text-sm font-semibold transition-colors',
                modo === o.v ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-brand/50 hover:text-ink')}>
              <o.icon className="h-4 w-4 shrink-0" aria-hidden /> {o.label}
            </button>
          ))}
        </div>
        {aberto && (modo === 'senha'
          ? <PorSenha pct={pct} onAutorizado={onAutorizado} onFechar={onFechar} />
          : <PeloGerente pct={pct} total={total} cliente={cliente} onAutorizado={onAutorizado} onFechar={onFechar} />)}
      </div>
    </Modal>
  )
}
