import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal, Field, Input, Button, Alert } from '../../components/ui'

/*
  Desconto acima do limite do consultor: o gerente (Administrativo, Supervisão ou Diretor)
  digita o próprio usuário e senha. A senha vai direto para o servidor e não fica guardada no PDV.
*/
const pctTxt = (v) => String(v ?? '').replace('.', ',')

export default function AutorizacaoDesconto({ aberto, pct, limite, onFechar, onAutorizado }) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { if (aberto) { setUsuario(''); setSenha(''); setErro(null) } }, [aberto])

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
    <Modal open={aberto} onOpenChange={(v) => !v && onFechar()} title="Autorização do gerente">
      <form onSubmit={autorizar} className="flex flex-col gap-4" noValidate autoComplete="off">
        <p className="flex items-start gap-2 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>O desconto de <b className="num">{pctTxt(pct)}%</b> passa do seu limite de <b className="num">{pctTxt(limite)}%</b>. Chame o gerente para autorizar com o usuário e a senha dele.</span>
        </p>
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
    </Modal>
  )
}
