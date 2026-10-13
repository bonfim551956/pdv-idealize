import { useEffect, useState } from 'react'
import { Printer, Info } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { brl, dataBR } from '../lib/format'
import { Field, Input, Select, Section, Spinner, Alert, Empty, Button, cx } from '../components/ui'
import { FORMAS } from '../features/recebimento/RecebimentoForm'

/*
  Fechamento de caixa do PDV (em paralelo ao Sistema ADM).
  Todo registro do dia entra: venda, garantia, garantia com valor, cortesia e conserto,
  inclusive os de valor zero. Serve para conferir com o fechamento do ADM até a integração.
*/

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TIPOS = { VENDA: 'Venda', GARANTIA: 'Garantia', GARANTIA_VALOR: 'Garantia c/ valor', CORTESIA: 'Cortesia', CONSERTO: 'Conserto', TROCA: 'Troca', ORCAMENTO: 'Orçamento' }
const TOM_TIPO = { VENDA: 'bg-brand-soft text-brand', GARANTIA: 'bg-accent/15 text-ink', GARANTIA_VALOR: 'bg-accent/15 text-ink', CORTESIA: 'bg-line/60 text-ink', CONSERTO: 'bg-line/60 text-ink' }
const nomeForma = (f) => (f === 'CARTAO_CREDITO' ? 'Cartão crédito' : f === 'CARTAO_DEBITO' ? 'Cartão débito' : FORMAS[f] || f)
const formasTxt = (fs) => (fs || []).map((f) => `${nomeForma(f.forma === 'CARTAO' ? `CARTAO_${f.modalidade || 'CREDITO'}` : f.forma)}${f.parcelas > 1 ? ` ${f.parcelas}x` : ''} ${brl(f.valor)}`).join(' + ')
const nomeLoja = (n) => (n || '').replace('Óticas Idealize ', '')

function Kpi({ rotulo, valor, cor, sub }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4">
      <span className="text-xs font-medium text-muted">{rotulo}</span>
      <span className={cx('num truncate font-display text-xl font-bold', cor)}>{valor}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}

export default function Fechamento() {
  const { isAdmin, perfil } = useAuth()
  const [data, setData] = useState(isoLocal(new Date()))
  const [loja, setLoja] = useState(perfil.loja_id || '')
  const [lojas, setLojas] = useState([])
  const [r, setR] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('lojas').select('id, nome').eq('ativo', true).order('nome').then(({ data: ls }) => {
      setLojas(ls || [])
      if (!loja && ls?.length) setLoja(ls[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  useEffect(() => {
    if (!loja || !data) return
    let ativo = true
    setR(null)
    supabase.rpc('fechamento_caixa', { p_data: data, p_loja: loja }).then(({ data: d, error }) => {
      if (!ativo) return
      if (error) { setErro(mensagemErro(error)); setR({}); return }
      setErro(null); setR(d)
    })
    return () => { ativo = false }
  }, [data, loja])

  const t = r?.totais
  const totalCaixa = t ? Number(t.recebido_vendas) + Number(t.recebido_entregas) : 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Fechamento de caixa</h1>
          <p className="mt-1 text-sm text-muted">{nomeLoja(r?.loja || perfil.loja?.nome)} · {dataBR(`${data}T12:00:00`)}</p>
        </div>
        <Button variant="secondary" icon={Printer} onClick={() => window.print()} className="print:hidden">Imprimir</Button>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-line bg-surface p-4 print:hidden">
        <Field label="Dia" className="w-44">{({ id }) => <Input id={id} type="date" max={isoLocal(new Date())} value={data} onChange={(e) => setData(e.target.value)} />}</Field>
        {isAdmin && (
          <Field label="Loja" className="w-56">
            {({ id }) => (
              <Select id={id} value={loja} onChange={(e) => setLoja(e.target.value)}>
                {lojas.map((l) => <option key={l.id} value={l.id}>{nomeLoja(l.nome)}</option>)}
              </Select>
            )}
          </Field>
        )}
        <p className="flex max-w-md items-start gap-2 self-center text-xs text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />Em paralelo ao Sistema ADM: confira os números com o fechamento de lá. Todo registro do dia entra, inclusive garantia, cortesia e conserto sem valor.
        </p>
      </div>

      {erro && <Alert>{erro}</Alert>}
      {!r ? <Spinner label="Carregando fechamento" /> : t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi rotulo="Registros (OS)" valor={t.qtd_registros} sub={`${t.qtd_vendas} com venda`} />
            <Kpi rotulo="Vendido" valor={brl(t.vendido)} />
            <Kpi rotulo="Entrou no caixa" valor={brl(totalCaixa)} cor="text-brand" sub={Number(t.recebido_entregas) > 0 ? `${brl(t.recebido_entregas)} de saldos` : null} />
            <Kpi rotulo="Saldo a receber" valor={brl(t.a_receber)} cor={Number(t.a_receber) > 0 ? 'text-danger' : undefined} />
            <Kpi rotulo="Canceladas" valor={t.canceladas} />
          </div>

          <Section title="Por forma de pagamento">
            {r.por_forma.length === 0 ? <p className="text-sm text-muted">Nenhum recebimento neste dia.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {r.por_forma.map((f) => (
                    <tr key={f.forma} className="border-b border-line last:border-0">
                      <td className="py-2">{nomeForma(f.forma)}</td>
                      <td className="py-2 text-right text-muted">{f.qtd} lanç.</td>
                      <td className="num py-2 text-right font-semibold">{brl(f.total)}</td>
                    </tr>
                  ))}
                  <tr><td className="pt-3 font-semibold">Total</td><td /><td className="num pt-3 text-right font-bold text-brand">{brl(totalCaixa)}</td></tr>
                </tbody>
              </table>
            )}
          </Section>

          <Section title={`Registros do dia (${r.vendas.length})`}>
            {r.vendas.length === 0 ? <Empty title="Nenhum registro neste dia" /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-line text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Hora</th><th className="py-2 pr-3 font-medium">OS</th><th className="py-2 pr-3 font-medium">Tipo</th>
                      <th className="py-2 pr-3 font-medium">Cliente</th><th className="py-2 pr-3 font-medium">Consultor</th>
                      <th className="py-2 pr-3 text-right font-medium">Total</th><th className="py-2 pr-3 font-medium">Pago hoje</th><th className="py-2 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.vendas.map((v) => (
                      <tr key={v.numero} className={cx('border-b border-line align-top last:border-0', v.status === 'cancelada' && 'text-muted line-through')}>
                        <td className="num py-2 pr-3">{v.hora}</td>
                        <td className="num py-2 pr-3 font-semibold">{v.os || <span className="font-normal text-muted">Venda {v.numero}</span>}</td>
                        <td className="py-2 pr-3"><span className={cx('rounded px-2 py-0.5 text-xs font-semibold', TOM_TIPO[v.tipo] || 'bg-line/60')}>{TIPOS[v.tipo] || v.tipo}</span></td>
                        <td className="py-2 pr-3">{v.cliente}</td>
                        <td className="py-2 pr-3">{v.vendedor}</td>
                        <td className="num py-2 pr-3 text-right">{brl(v.total)}</td>
                        <td className="py-2 pr-3 text-xs">{v.formas ? formasTxt(v.formas) : <span className="text-muted">—</span>}</td>
                        <td className={cx('num py-2 text-right', Number(v.saldo) > 0 && 'rounded bg-danger px-2 font-bold text-surface')}>{Number(v.saldo) > 0 ? brl(v.saldo) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={`Saldos recebidos de vendas anteriores (${r.entregas.length})`}>
            {r.entregas.length === 0 ? <p className="text-sm text-muted">Nenhum saldo recebido neste dia.</p> : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr><th className="py-2 pr-3 font-medium">OS</th><th className="py-2 pr-3 font-medium">Cliente</th><th className="py-2 pr-3 font-medium">Venda em</th><th className="py-2 pr-3 font-medium">Forma</th><th className="py-2 text-right font-medium">Valor</th></tr>
                </thead>
                <tbody>
                  {r.entregas.map((e) => (
                    <tr key={e.numero} className="border-b border-line last:border-0">
                      <td className="num py-2 pr-3 font-semibold">{e.os || `Venda ${e.numero}`}</td>
                      <td className="py-2 pr-3">{e.cliente}</td>
                      <td className="py-2 pr-3">{dataBR(`${e.data_venda}T12:00:00`)}</td>
                      <td className="py-2 pr-3 text-xs">{formasTxt(e.formas)}</td>
                      <td className="num py-2 text-right font-semibold">{brl(e.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
