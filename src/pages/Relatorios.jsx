import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { brl, dataBR, dataHoraBR, STATUS_OS } from '../lib/format'
import { Chips, Field, Input, Select, Section, Spinner, Alert, Empty, cx } from '../components/ui'
import { FORMAS } from '../features/recebimento/RecebimentoForm'

const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mes_ant', label: 'Mês passado' },
  { value: 'ano', label: 'Este ano' },
  { value: 'custom', label: 'Período' },
]
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function intervalo(periodo, de, ate) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const soma = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  switch (periodo) {
    case 'hoje': return [hoje, soma(hoje, 1)]
    case '7d': return [soma(hoje, -6), soma(hoje, 1)]
    case 'mes': return [new Date(hoje.getFullYear(), hoje.getMonth(), 1), soma(hoje, 1)]
    case 'mes_ant': return [new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), new Date(hoje.getFullYear(), hoje.getMonth(), 1)]
    case 'ano': return [new Date(hoje.getFullYear(), 0, 1), soma(hoje, 1)]
    default: return [new Date(`${de}T00:00:00`), soma(new Date(`${ate}T00:00:00`), 1)]
  }
}
const pct = (v, t) => (t > 0 ? `${((v / t) * 100).toFixed(0)}%` : '0%')
const nomeLoja = (n) => (n || '').replace('Óticas Idealize ', '')
const titulo = (t) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : '—')

function Kpi({ rotulo, valor, sub, cor }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4">
      <span className="text-xs font-medium text-muted">{rotulo}</span>
      <span className={cx('num truncate font-display text-xl font-bold', cor)}>{valor}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}

/* Barras horizontais: rótulo, barra proporcional e valores */
function Barras({ itens, rotulo, valor, detalhe, cor = 'bg-brand', vazio = 'Sem dados no período.' }) {
  if (!itens?.length) return <p className="text-sm text-muted">{vazio}</p>
  const max = Math.max(...itens.map((i) => Number(valor(i)) || 0), 1)
  const total = itens.reduce((s, i) => s + (Number(valor(i)) || 0), 0)
  return (
    <ul className="flex flex-col gap-3">
      {itens.map((i, k) => {
        const v = Number(valor(i)) || 0
        return (
          <li key={k} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{rotulo(i)}</span>
              <span className="num shrink-0 text-muted">{detalhe ? detalhe(i) : ''} <b className="text-ink">{pct(v, total)}</b></span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line/60">
              <div className={cx('h-full rounded-full', cor)} style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* Faturamento por dia em colunas */
function Colunas({ dias }) {
  if (!dias?.length) return <p className="text-sm text-muted">Sem vendas no período.</p>
  const max = Math.max(...dias.map((d) => Number(d.total)), 1)
  return (
    <div className="overflow-x-auto">
      <div className="flex h-48 items-end gap-1" style={{ minWidth: dias.length * 24 }}>
        {dias.map((d) => (
          <div key={d.dia} className="group flex h-full min-w-[20px] flex-1 flex-col items-center justify-end gap-1">
            <span className="num hidden text-[12px] font-semibold text-ink group-hover:block">{brl(d.total)}</span>
            <div className="w-full rounded-t bg-brand transition-colors group-hover:bg-accent" style={{ height: `${Math.max((Number(d.total) / max) * 100, 2)}%` }}
              title={`${dataBR(d.dia + 'T12:00:00')}: ${brl(d.total)} em ${d.vendas} venda(s)`} />
            <span className="num text-[12px] text-muted">{dataBR(d.dia + 'T12:00:00').slice(0, 5)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Relatorios() {
  const { isAdmin, perfil } = useAuth()
  const [periodo, setPeriodo] = useState('mes')
  const [de, setDe] = useState(isoLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [ate, setAte] = useState(isoLocal(new Date()))
  const [loja, setLoja] = useState('')
  const [lojas, setLojas] = useState([])
  const [r, setR] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (isAdmin) supabase.from('lojas').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setLojas(data || []))
  }, [isAdmin])

  useEffect(() => {
    let ativo = true
    setR(null)
    const [ini, fim] = intervalo(periodo, de, ate)
    supabase.rpc('relatorio', { p_ini: ini.toISOString(), p_fim: fim.toISOString(), p_loja: loja || null }).then(({ data, error }) => {
      if (!ativo) return
      if (error) { setErro(mensagemErro(error)); setR({}); return }
      setErro(null); setR(data)
    })
    return () => { ativo = false }
  }, [periodo, de, ate, loja])

  const res = r?.resumo
  const totalLentes = (r?.lentes_categoria || []).reduce((s, x) => s + Number(x.qtd), 0)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Relatórios</h1>
          <p className="mt-1 text-sm text-muted">{isAdmin ? (loja ? nomeLoja(lojas.find((l) => l.id === loja)?.nome) : 'Todas as lojas') : perfil.loja?.nome} · vendas confirmadas</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
        <Chips label="Período" options={PERIODOS} value={periodo} onChange={(v) => v && setPeriodo(v)} />
        <div className="flex flex-wrap gap-4">
          {periodo === 'custom' && (
            <>
              <Field label="De" className="w-44">{({ id }) => <Input id={id} type="date" value={de} onChange={(e) => setDe(e.target.value)} />}</Field>
              <Field label="Até" className="w-44">{({ id }) => <Input id={id} type="date" value={ate} onChange={(e) => setAte(e.target.value)} />}</Field>
            </>
          )}
          {isAdmin && (
            <Field label="Loja" className="w-56">
              {({ id }) => (
                <Select id={id} value={loja} onChange={(e) => setLoja(e.target.value)}>
                  <option value="">Todas as lojas</option>
                  {lojas.map((l) => <option key={l.id} value={l.id}>{nomeLoja(l.nome)}</option>)}
                </Select>
              )}
            </Field>
          )}
        </div>
      </div>

      {erro && <Alert>{erro}</Alert>}
      {r === null ? <Spinner label="Calculando relatórios" /> : !res ? null : res.vendas === 0 && !(r.os_atrasadas?.length) ? (
        <Empty title="Nenhuma venda confirmada nesse período">Escolha outro período para ver os números.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi rotulo="Faturamento" valor={brl(res.total)} sub={`${res.vendas} venda${res.vendas === 1 ? '' : 's'}${res.canceladas ? ` · ${res.canceladas} cancelada${res.canceladas === 1 ? '' : 's'}` : ''}`} cor="text-brand" />
            <Kpi rotulo="Ticket médio" valor={brl(res.ticket)} sub={`${res.os} OS geradas`} />
            <Kpi rotulo="Recebido" valor={brl(res.recebido)} sub={`${pct(Number(res.recebido), Number(res.total))} do faturamento`} cor="text-ok" />
            <Kpi rotulo="Descontos" valor={brl(res.desconto)} sub={`${pct(Number(res.desconto), Number(res.bruto))} do valor bruto`} />
          </div>

          <Section title="Faturamento por dia"><Colunas dias={r.por_dia} /></Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Ranking de consultores">
              {r.por_consultor.length === 0 ? <p className="text-sm text-muted">Sem vendas no período.</p> : (
                <ol className="flex flex-col divide-y divide-line">
                  {r.por_consultor.map((c, i) => (
                    <li key={c.consultor + c.loja} className="flex items-center gap-3 py-3">
                      <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-sm font-bold',
                        i === 0 ? 'bg-accent text-ink' : 'bg-brand-soft text-brand')}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{c.consultor}</p>
                        <p className="text-xs text-muted">{isAdmin && `${nomeLoja(c.loja)} · `}{c.vendas} venda{c.vendas === 1 ? '' : 's'} · ticket {brl(c.ticket)}</p>
                      </div>
                      <span className="num font-semibold">{brl(c.total)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section title="Formas de pagamento">
              <Barras itens={r.formas} rotulo={(f) => FORMAS[f.forma]} valor={(f) => f.valor} detalhe={(f) => brl(f.valor)} cor="bg-brand-bright" />
            </Section>

            {isAdmin && !loja && r.por_loja.length > 0 && (
              <Section title="Por loja">
                <Barras itens={r.por_loja} rotulo={(l) => `${nomeLoja(l.loja)} · ${l.vendas} vendas · ticket ${brl(l.ticket)}`} valor={(l) => l.total} detalhe={(l) => brl(l.total)} />
              </Section>
            )}

            <Section title="Lentes vendidas" aside={totalLentes > 0 && <span className="num text-sm text-muted">{totalLentes} lentes</span>}>
              <div className="flex flex-col gap-6">
                <Barras itens={r.lentes_categoria} rotulo={(x) => titulo(x.categoria)} valor={(x) => x.qtd} detalhe={(x) => `${Number(x.qtd)} un.`} cor="bg-accent" />
                <div>
                  <p className="mb-2 text-sm font-semibold text-muted">Por tratamento</p>
                  <Barras itens={r.lentes_tratamento} rotulo={(x) => titulo(x.tratamento)} valor={(x) => x.qtd} detalhe={(x) => `${Number(x.qtd)} un. · ${brl(x.total)}`} />
                </div>
              </div>
            </Section>

            <Section title="Lentes por linha e índice">
              <div className="flex flex-col gap-6">
                <Barras itens={r.lentes_linha} rotulo={(x) => x.linha} valor={(x) => x.qtd} detalhe={(x) => `${Number(x.qtd)} un. · ${brl(x.total)}`} />
                <div>
                  <p className="mb-2 text-sm font-semibold text-muted">Por índice</p>
                  <Barras itens={r.lentes_indice} rotulo={(x) => String(Number(x.indice).toFixed(2)).replace('.', ',')} valor={(x) => x.qtd} detalhe={(x) => `${Number(x.qtd)} un.`} cor="bg-brand-bright" />
                </div>
              </div>
            </Section>

            <Section title="Contas a receber" aside={<span className="text-xs text-muted">carnê, boleto e cheque · hoje</span>}>
              <div className="grid grid-cols-3 gap-3">
                <Kpi rotulo="Vencido" valor={brl(r.a_receber.vencido)} sub={`${r.a_receber.parcelas_vencidas} parcela${r.a_receber.parcelas_vencidas === 1 ? '' : 's'}`} cor={Number(r.a_receber.vencido) > 0 ? 'text-danger' : ''} />
                <Kpi rotulo="Próx. 30 dias" valor={brl(r.a_receber.proximos_30)} />
                <Kpi rotulo="Total em aberto" valor={brl(r.a_receber.total)} />
              </div>
            </Section>
          </div>

          <Section title="Ordens de serviço em aberto" aside={<span className="text-xs text-muted">situação de hoje</span>}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap gap-3">
                {(r.os_status || []).map((s) => (
                  <div key={s.status} className="rounded-md border border-line px-4 py-2">
                    <p className="num font-display text-lg font-bold">{s.qtd}</p>
                    <p className="text-xs text-muted">{STATUS_OS[s.status]}</p>
                  </div>
                ))}
                {!r.os_status?.length && <p className="text-sm text-muted">Nenhuma OS em aberto.</p>}
              </div>
              {r.os_atrasadas?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                    <AlertTriangle className="h-4 w-4" aria-hidden /> {r.os_atrasadas.length} OS com entrega vencida e ainda não pronta{r.os_atrasadas.length === 1 ? '' : 's'}
                  </p>
                  <div className="overflow-x-auto rounded-md border border-line">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b border-line bg-bg text-muted">
                        <tr><th className="px-3 py-2 font-medium">OS</th><th className="px-3 py-2 font-medium">Cliente</th>{isAdmin && <th className="px-3 py-2 font-medium">Loja</th>}<th className="px-3 py-2 font-medium">Retirada prometida</th><th className="px-3 py-2 font-medium">Situação</th></tr>
                      </thead>
                      <tbody>
                        {r.os_atrasadas.map((o) => (
                          <tr key={o.id} className="border-b border-line last:border-0">
                            <td className="px-3 py-2"><Link to={`/vendas/${o.venda_id}`} className="num font-semibold text-brand hover:underline">nº {o.numero}</Link></td>
                            <td className="px-3 py-2">{o.cliente}</td>
                            {isAdmin && <td className="px-3 py-2">{nomeLoja(o.loja)}</td>}
                            <td className="num px-3 py-2 text-danger">{dataBR(o.previsao_entrega)}</td>
                            <td className="px-3 py-2 text-muted">{STATUS_OS[o.status]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
