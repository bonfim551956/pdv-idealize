import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Banknote, QrCode, Wallet, CreditCard, FileText, Receipt, Landmark, Coins, Undo2 } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { brl, dataBR, dataHoraBR, grau, STATUS_OS } from '../lib/format'
import { Button, Section, Spinner, Alert, Modal, cx, useToast } from '../components/ui'
import RecebimentoForm, { FORMAS } from '../features/recebimento/RecebimentoForm'
import { StatusVenda } from './Vendas'

const ICONES = { DINHEIRO: Banknote, PIX: QrCode, CARTEIRA_DIGITAL: Wallet, CARTAO: CreditCard, CARNE: FileText, BOLETO: Receipt, CHEQUE: Landmark, CREDITOS: Coins }

function Receita({ receitas }) {
  if (!receitas?.length) return <p className="text-sm text-muted">Sem receita.</p>
  const ord = [...receitas].sort((a, b) => a.olho.localeCompare(b.olho))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-muted">
          <tr>{['', 'Esf. longe', 'Cil.', 'Eixo', 'Adição', 'Esf. perto'].map((h) => <th key={h} className="px-2 py-1 text-center font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {ord.map((r) => (
            <tr key={r.olho}>
              <td className="px-2 py-1"><span className={cx('rounded px-2 py-0.5 text-xs font-bold text-surface', r.olho === 'OD' ? 'bg-od' : 'bg-oe')}>{r.olho}</span></td>
              <td className="px-2 py-1 text-center num font-semibold">{grau(r.esferico_longe)}</td>
              <td className="px-2 py-1 text-center num">{grau(r.cilindrico)}</td>
              <td className="px-2 py-1 text-center num">{r.eixo != null ? `${r.eixo}°` : ''}</td>
              <td className="px-2 py-1 text-center num">{grau(r.adicao)}</td>
              <td className="px-2 py-1 text-center num">{grau(r.esferico_perto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function VendaDetalhe() {
  const { id } = useParams()
  const toast = useToast()
  const [venda, setVenda] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [receb, setReceb] = useState([])
  const [caixas, setCaixas] = useState([])
  const [erro, setErro] = useState(null)
  const [forma, setForma] = useState(null)
  const [estornar, setEstornar] = useState(null)
  const [processando, setProcessando] = useState(false)

  const carregar = useCallback(async () => {
    const [v, r, rc] = await Promise.all([
      supabase.from('vendas').select(`
        id, numero, status, tipo, data_venda, observacoes, campos_extras, loja_id, total_bruto, total_desconto, total_liquido,
        cliente:clientes(id, nome, documento), vendedor:colaboradores!vendas_vendedor_id_fkey(nome), loja:lojas(nome),
        itens:itens_venda(id, sku, descricao, olho, quantidade, preco_unitario, desconto, total, os_id),
        ordens:ordens_servico(id, numero, letra, status, previsao_entrega, paciente:clientes(nome),
          receitas(olho, esferico_longe, cilindrico, eixo, adicao, esferico_perto))
      `).eq('id', id).single(),
      supabase.from('v_venda_resumo').select('*').eq('venda_id', id).single(),
      supabase.from('recebimentos').select('*, parcelas:recebimento_parcelas(numero, valor, vencimento, documento)').eq('venda_id', id).order('created_at'),
    ])
    const err = v.error || r.error || rc.error
    if (err) { setErro(mensagemErro(err)); return }
    setVenda(v.data); setResumo(r.data); setReceb(rc.data)
    const { data: cx } = await supabase.from('caixas').select('id, nome').eq('loja_id', v.data.loja_id).eq('status', 'aberto')
    setCaixas(cx || [])
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  const confirmarEstorno = async () => {
    setProcessando(true)
    const { error } = await supabase.from('recebimentos').update({ status: 'estornado', estornado_em: new Date().toISOString() }).eq('id', estornar.id)
    setProcessando(false)
    if (error) { toast(mensagemErro(error), 'erro'); return }
    toast('Recebimento estornado')
    setEstornar(null)
    carregar()
  }

  if (erro) return <div className="mx-auto max-w-3xl"><Alert>{erro}</Alert></div>
  if (!venda) return <Spinner />

  const saldo = Number(resumo.a_receber)
  const podeReceber = venda.status === 'confirmada' && saldo > 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Link to="/" className="flex items-center gap-1 self-start text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Vendas</Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Venda <span className="num">{venda.numero}</span></h1>
            <StatusVenda status={venda.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {venda.cliente.nome} · {venda.loja.nome} · {venda.vendedor.nome} · {dataHoraBR(venda.data_venda)}
          </p>
        </div>
      </div>

      {/* Resumo financeiro: o número que importa no balcão */}
      <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-surface">
        {[
          ['Total', resumo.total, 'text-ink'],
          ['Recebido', resumo.recebido, 'text-ok'],
          ['A receber', saldo, saldo > 0 ? 'text-danger' : 'text-muted'],
        ].map(([l, val, cor], i) => (
          <div key={l} className={cx('flex flex-col gap-1 p-4 sm:p-6', i > 0 && 'border-l border-line')}>
            <span className="text-sm text-muted">{l}</span>
            <span className={cx('num text-lg font-bold sm:text-2xl', cor)}>{brl(val)}</span>
          </div>
        ))}
      </div>

      {podeReceber && (
        <Section title="Receber pagamento">
          {!forma ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(FORMAS).map(([k, l]) => {
                const Icon = ICONES[k]
                const desab = k === 'CREDITOS'
                return (
                  <button key={k} type="button" disabled={desab} onClick={() => setForma(k)}
                    title={desab ? 'O cliente não tem créditos disponíveis' : undefined}
                    className="flex h-16 items-center gap-3 rounded-md border border-line bg-surface px-4 text-left font-semibold transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand disabled:cursor-not-allowed disabled:opacity-40">
                    <Icon className="h-5 w-5 shrink-0" aria-hidden /> {l}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="flex items-center gap-2 font-semibold">
                {(() => { const I = ICONES[forma]; return <I className="h-5 w-5 text-brand" aria-hidden /> })()}
                Recebimento em {FORMAS[forma].toLowerCase()}
              </p>
              {caixas.length === 0 ? (
                <Alert>Não há caixa aberto nesta loja. Abra um caixa para registrar recebimentos.</Alert>
              ) : (
                <RecebimentoForm key={forma} venda={venda} saldo={saldo} caixas={caixas} forma={forma}
                  onCancelar={() => setForma(null)} onSalvo={() => { setForma(null); carregar() }} />
              )}
            </div>
          )}
        </Section>
      )}
      {venda.status === 'confirmada' && saldo === 0 && Number(resumo.total) > 0 && (
        <Alert tone="ok">Venda quitada.</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Recebimentos">
          {receb.length === 0 ? (
            <p className="text-sm text-muted">Nenhum recebimento registrado.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {receb.map((r) => (
                <li key={r.id} className={cx('flex flex-col gap-1 py-3', r.status === 'estornado' && 'opacity-50')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {FORMAS[r.forma]}
                      {r.forma === 'CARTAO' && ` ${r.modalidade === 'DEBITO' ? 'débito' : `crédito ${r.parcelas}x`}`}
                      {r.status === 'estornado' && ' · estornado'}
                    </span>
                    <span className={cx('num font-semibold', r.status === 'estornado' && 'line-through')}>{brl(r.valor)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {dataBR(r.data_entrada + 'T12:00:00')}
                      {r.bandeira && ` · ${r.bandeira}`}{r.nsu && ` · NSU ${r.nsu}`}
                      {r.parcelas?.length > 0 && ` · ${r.parcelas.length} parcela${r.parcelas.length > 1 ? 's' : ''}, 1º venc. ${dataBR(r.parcelas[0].vencimento + 'T12:00:00')}`}
                    </span>
                    {r.status === 'ativo' && (
                      <button onClick={() => setEstornar(r)} className="flex items-center gap-1 font-medium hover:text-danger">
                        <Undo2 className="h-3 w-3" aria-hidden /> Estornar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Itens">
          <ul className="flex flex-col divide-y divide-line text-sm">
            {venda.itens.map((i) => (
              <li key={i.id} className="flex justify-between gap-4 py-2">
                <span>
                  <span className="font-medium">{i.descricao}</span>
                  <span className="text-muted"> · {Number(i.quantidade)} un.{i.olho ? ` · ${i.olho === 'AMBOS' ? 'ambos' : i.olho}` : ''}</span>
                  {Number(i.desconto) > 0 && <span className="block text-xs text-muted">desconto {brl(i.desconto)}</span>}
                </span>
                <span className="num font-semibold">{brl(i.total)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {venda.ordens.map((o) => (
        <Section key={o.id} title={`OS ${o.letra} · nº ${o.numero}`} aside={<span className="rounded bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">{STATUS_OS[o.status]}</span>}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Paciente <span className="font-medium text-ink">{o.paciente?.nome}</span> · entrega prevista {dataHoraBR(o.previsao_entrega)}</p>
            <Receita receitas={o.receitas} />
          </div>
        </Section>
      ))}

      <Modal open={!!estornar} onOpenChange={(v) => !v && setEstornar(null)} title="Estornar recebimento?">
        {estornar && (
          <div className="flex flex-col gap-6">
            <p className="text-sm">O recebimento de <strong>{FORMAS[estornar.forma]} {brl(estornar.valor)}</strong> será marcado como estornado e o valor volta para o saldo a receber. O ADM é avisado automaticamente.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEstornar(null)}>Manter</Button>
              <Button variant="danger" loading={processando} onClick={confirmarEstorno}>Estornar recebimento</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
