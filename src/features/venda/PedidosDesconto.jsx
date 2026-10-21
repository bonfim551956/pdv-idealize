import { useCallback, useEffect, useState } from 'react'
import { BadgePercent, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { brl } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import { Button, useToast } from '../../components/ui'

/*
  Pedidos de desconto acima do limite, na tela do gerente (Administrativo da loja, Supervisão ou Diretor).
  Aparece em qualquer página do PDV; o gerente aprova ou recusa pelo próprio usuário.
  O banco confere loja e limite do gerente (pdv.responder_desconto).
*/
const pctTxt = (v) => String(v ?? '').replace('.', ',')
const nomeLoja = (n) => (n || '').replace('Óticas Idealize ', '')
const INTERVALO = 8000

export default function PedidosDesconto() {
  const { perfil, perm } = useAuth()
  const toast = useToast()
  const [pedidos, setPedidos] = useState([])
  const [respondendo, setRespondendo] = useState(null)
  const [erros, setErros] = useState({})

  const carregar = useCallback(async () => {
    if (document.visibilityState === 'hidden') return
    const { data } = await supabase.from('solicitacoes_desconto')
      .select('id, pct, total, cliente, criado_em, vendedor_id, vendedor:colaboradores!solicitacoes_desconto_vendedor_id_fkey(nome), loja:lojas(nome)')
      .eq('status', 'pendente').gt('expira_em', new Date().toISOString()).order('criado_em')
    setPedidos((data || []).filter((p) => p.vendedor_id !== perfil.id))
  }, [perfil.id])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, INTERVALO)
    document.addEventListener('visibilitychange', carregar)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', carregar) }
  }, [carregar])

  const responder = async (p, aprovar) => {
    setRespondendo(p.id + (aprovar ? 'ok' : 'nao')); setErros((e) => ({ ...e, [p.id]: null }))
    const { error } = await supabase.rpc('responder_desconto', { p_id: p.id, p_aprovar: aprovar })
    setRespondendo(null)
    if (error) { setErros((e) => ({ ...e, [p.id]: error.message })); carregar(); return }
    toast(aprovar ? `Desconto de ${pctTxt(p.pct)}% aprovado para ${p.vendedor?.nome?.split(' ')[0] || 'o consultor'}` : 'Desconto recusado')
    setPedidos((l) => l.filter((x) => x.id !== p.id))
  }

  if (!pedidos.length) return null
  return (
    <section aria-label="Pedidos de desconto" aria-live="polite"
      className="fixed inset-x-4 bottom-20 z-40 flex flex-col gap-2 sm:left-auto sm:right-6 sm:w-96 md:bottom-6">
      {pedidos.map((p) => (
        <div key={p.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-dark"><BadgePercent className="h-5 w-5" aria-hidden /></span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold">Pedido de desconto: <span className="num">{pctTxt(p.pct)}%</span></p>
              <p className="text-muted">
                {p.vendedor?.nome || 'Consultor'}{perm.todasLojas && p.loja?.nome ? ` · ${nomeLoja(p.loja.nome)}` : ''}
                {p.cliente ? ` · ${p.cliente}` : ''}
              </p>
              {p.total != null && <p className="num text-muted">Venda de {brl(Number(p.total))}</p>}
            </div>
          </div>
          {erros[p.id] && <p className="rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert">{erros[p.id]}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" icon={X} loading={respondendo === p.id + 'nao'} disabled={!!respondendo} onClick={() => responder(p, false)}>Recusar</Button>
            <Button icon={Check} loading={respondendo === p.id + 'ok'} disabled={!!respondendo} onClick={() => responder(p, true)}>Aprovar</Button>
          </div>
        </div>
      ))}
    </section>
  )
}
