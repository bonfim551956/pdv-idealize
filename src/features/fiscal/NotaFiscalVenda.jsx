import { useCallback, useEffect, useState } from 'react'
import { FileCheck2, FileDown, RefreshCw, Ban, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { nfce, STATUS_NF } from '../../lib/nfce'
import { brl, dataHoraBR } from '../../lib/format'
import { Button, Section, Modal, Alert, cx, useToast } from '../../components/ui'

const cpfFmt = (d) => (d ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '')
const ATIVAS = ['autorizado', 'processando', 'processando_autorizacao']

/*
  NFC-e (modelo 65) da venda, uma por cliente/CPF quando a venda tem mais de um paciente.
  Emissão, consulta e cancelamento passam pela função nfce (Focus NFe).
*/
export default function NotaFiscalVenda({ venda, porCliente }) {
  const toast = useToast()
  const [notas, setNotas] = useState([])
  const [ocupado, setOcupado] = useState(null)
  const [erro, setErro] = useState(null)
  const [cancelar, setCancelar] = useState(null)
  const [just, setJust] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('notas_fiscais').select('*').eq('venda_id', venda.id).order('created_at')
    setNotas(data || [])
  }, [venda.id])
  useEffect(() => { carregar() }, [carregar])

  const rodar = async (chave, body, ok) => {
    setOcupado(chave); setErro(null)
    try {
      const r = await nfce(body)
      const n = r?.nota
      if (n?.status === 'erro_autorizacao') setErro(`Nota rejeitada pela SEFAZ: ${n.mensagem || 'veja o detalhe na lista.'}`)
      else if (ok) toast(ok)
      await carregar()
      return r
    } catch (e) {
      setErro(e.message)
    } finally { setOcupado(null) }
  }

  const confirmarCancelamento = async () => {
    const r = await rodar(`c-${cancelar.id}`, { acao: 'cancelar', nota_id: cancelar.id, justificativa: just.trim() })
    if (r?.nota?.status === 'cancelado') { toast('Nota cancelada'); setCancelar(null); setJust('') }
  }

  const clientes = porCliente.filter((c) => c.total > 0)
  const temAtiva = (cid) => notas.some((n) => n.cliente_id === cid && ATIVAS.includes(n.status))

  return (
    <Section title="Nota fiscal (NFC-e)" aside={<span className="text-xs text-muted">uma nota por CPF</span>}>
      <div className="flex flex-col gap-4">
        {erro && <Alert>{erro}</Alert>}

        {venda.status === 'confirmada' && (
          <ul className="flex flex-col divide-y divide-line">
            {clientes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  <span className="font-medium">{c.nome}</span>
                  <span className="block text-xs text-muted">{c.documento ? `CPF ${cpfFmt(c.documento)}` : 'sem CPF (nota sai sem identificação)'} · produtos {brl(c.total)}</span>
                </span>
                {temAtiva(c.id) ? (
                  <span className="text-xs font-semibold text-ok">Nota emitida</span>
                ) : (
                  <Button size="sm" icon={FileCheck2} loading={ocupado === `e-${c.id}`} disabled={!!ocupado}
                    onClick={() => rodar(`e-${c.id}`, { acao: 'emitir', venda_id: venda.id, cliente_id: c.id }, 'Nota fiscal autorizada')}>
                    Emitir NFC-e
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {venda.status !== 'confirmada' && notas.length === 0 && <p className="text-sm text-muted">Só venda confirmada emite nota.</p>}

        {notas.length > 0 && (
          <ul className="flex flex-col gap-2">
            {notas.map((n) => {
              const st = STATUS_NF[n.status] || { rotulo: n.status, tom: 'bg-line/60' }
              const cli = porCliente.find((c) => c.id === n.cliente_id)
              return (
                <li key={n.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className={cx('rounded px-2 py-0.5 text-xs font-semibold', st.tom)}>{st.rotulo}</span>
                      <span className="font-medium">{n.numero ? `NFC-e ${n.numero}${n.serie ? `/${n.serie}` : ''}` : 'NFC-e'}</span>
                      {n.ambiente === 'homologacao' && <span className="rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent-dark">teste</span>}
                    </span>
                    <span className="num font-semibold">{brl(n.valor)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{cli?.nome || ''} · {dataHoraBR(n.created_at)}{n.cancelada_em ? ` · cancelada em ${dataHoraBR(n.cancelada_em)}` : ''}</p>
                  {n.mensagem && n.status !== 'autorizado' && <p className="mt-1 text-xs text-danger">{n.mensagem}</p>}
                  {n.chave && <p className="num mt-1 break-all text-xs text-muted">Chave {n.chave}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {n.danfe_url && <a href={n.danfe_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-brand hover:text-brand"><FileDown className="h-3.5 w-3.5" />DANFE</a>}
                    {n.xml_url && <a href={n.xml_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-brand hover:text-brand"><FileDown className="h-3.5 w-3.5" />XML</a>}
                    {n.consulta_url && <a href={n.consulta_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-brand hover:text-brand"><ExternalLink className="h-3.5 w-3.5" />Consulta SEFAZ</a>}
                    {n.status !== 'cancelado' && (
                      <Button size="sm" variant="ghost" icon={RefreshCw} loading={ocupado === `q-${n.id}`} disabled={!!ocupado}
                        onClick={() => rodar(`q-${n.id}`, { acao: 'consultar', nota_id: n.id }, 'Situação atualizada')}>Atualizar</Button>
                    )}
                    {n.status === 'autorizado' && (
                      <Button size="sm" variant="ghost" icon={Ban} disabled={!!ocupado} onClick={() => setCancelar(n)}>Cancelar nota</Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Modal open={!!cancelar} onOpenChange={(v) => { if (!v) { setCancelar(null); setJust('') } }} title="Cancelar nota fiscal?">
        <div className="flex flex-col gap-4">
          <p className="text-sm">A SEFAZ só aceita cancelamento de NFC-e em até 30 minutos depois da autorização. Depois disso, fale com o contador.</p>
          <label className="flex flex-col gap-1 text-sm font-medium text-muted">Justificativa * <span className="text-xs font-normal">mínimo 15 caracteres ({just.trim().length}/15)</span>
            <textarea className="min-h-20 rounded-md border border-line bg-surface p-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              value={just} maxLength={255} onChange={(e) => setJust(e.target.value)} placeholder="Ex.: nota emitida com valor errado" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCancelar(null); setJust('') }}>Voltar</Button>
            <Button variant="danger" loading={!!ocupado} disabled={just.trim().length < 15} onClick={confirmarCancelamento}>Cancelar nota</Button>
          </div>
        </div>
      </Modal>
    </Section>
  )
}
