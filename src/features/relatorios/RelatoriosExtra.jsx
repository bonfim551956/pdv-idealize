import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Trophy, Search } from 'lucide-react'
import { supabase, mensagemErro } from '../../lib/supabase'
import { brl, dataHoraBR } from '../../lib/format'
import { Field, Input, Select, Section, Spinner, Alert, Empty, Button, Chips, cx } from '../../components/ui'
import { FORMAS } from '../recebimento/RecebimentoForm'
import { Kpi, Barras, pct, nomeLoja } from './partes'

export const VISOES = [
  { value: 'geral', label: 'Visão geral' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'comissionado', label: 'Comissionado' },
  { value: 'analitico', label: 'Analítico' },
  { value: 'detalhado', label: 'Detalhado' },
]

const TIPOS = { VENDA: 'Venda', GARANTIA: 'Garantia', GARANTIA_VALOR: 'Garantia c/ valor', CORTESIA: 'Cortesia', CONSERTO: 'Conserto', TROCA: 'Troca', ORCAMENTO: 'Orçamento' }
const PRODUTOS = { lente: 'Lentes', armacao: 'Armações', solar: 'Solares', tratamento: 'Tratamentos', servico: 'Serviços', acessorio: 'Acessórios', lente_contato: 'Lentes de contato' }
const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const nomeForma = (f) => (f === 'CARTAO_CREDITO' ? 'Cartão crédito' : f === 'CARTAO_DEBITO' ? 'Cartão débito' : FORMAS[f] || f)
const n = (v) => Number(v || 0)

// Preferências da comissão ficam só neste navegador
const lerPref = () => { try { return JSON.parse(localStorage.getItem('pdv-comissao') || '{}') } catch { return {} } }
const gravarPref = (p) => { try { localStorage.setItem('pdv-comissao', JSON.stringify(p)) } catch { /* sem armazenamento */ } }

function Medalha({ posicao }) {
  const cor = posicao === 1 ? 'bg-accent text-ink' : posicao <= 3 ? 'bg-brand text-surface' : 'bg-brand-soft text-brand'
  return <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold', cor)}>{posicao === 1 ? <Trophy className="h-4 w-4" /> : posicao}</span>
}

/* Filtros comuns: consultor, tipo de venda e (na comissão) forma de pagamento; e o modo resumido/detalhado */
function Filtros({ consultores, consultor, setConsultor, tipo, setTipo, formas, forma, setForma, modo, setModo, extra }) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-line bg-surface p-4">
      <Chips label="Exibir" options={[{ value: 'resumido', label: 'Resumido' }, { value: 'detalhado', label: 'Detalhado' }]} value={modo} onChange={(v) => v && setModo(v)} />
      <Field label="Consultor" className="w-56">
        {({ id }) => (
          <Select id={id} value={consultor} onChange={(e) => setConsultor(e.target.value)}>
            <option value="">Todos</option>
            {consultores.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Tipo" className="w-48">
        {({ id }) => (
          <Select id={id} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).filter(([k]) => !['GARANTIA', 'CORTESIA', 'ORCAMENTO'].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
      </Field>
      {formas && (
        <Field label="Forma de pagamento" className="w-52">
          {({ id }) => (
            <Select id={id} value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="">Todas</option>
              {formas.map((f) => <option key={f} value={f}>{nomeForma(f)}</option>)}
            </Select>
          )}
        </Field>
      )}
      {extra}
    </div>
  )
}

/* Ranking: tudo o que foi FATURADO no período (vendas confirmadas, sem garantia/cortesia), por consultor */
function Ranking({ d, isAdmin }) {
  const [modo, setModo] = useState('resumido')
  const [consultor, setConsultor] = useState('')
  const [tipo, setTipo] = useState('')
  const faturadas = d.detalhado.filter((v) => v.status === 'confirmada' && !['GARANTIA', 'CORTESIA', 'ORCAMENTO'].includes(v.tipo))
  const consultores = [...new Set(faturadas.map((v) => v.consultor))].sort()
  const vendas = faturadas.filter((v) => (!consultor || v.consultor === consultor) && (!tipo || v.tipo === tipo))
  const grupos = Object.values(vendas.reduce((acc, v) => {
    const g = acc[v.consultor] || (acc[v.consultor] = { consultor: v.consultor, loja: v.loja, vendas: [], total: 0, bruto: 0, desconto: 0, recebido: 0 })
    g.vendas.push(v); g.total += n(v.total); g.bruto += n(v.bruto); g.desconto += n(v.desconto); g.recebido += n(v.recebido)
    return acc
  }, {})).sort((a, b) => b.total - a.total).map((g, i) => ({ ...g, posicao: i + 1, ticket: g.vendas.length ? g.total / g.vendas.length : 0 }))
  const total = grupos.reduce((t, g) => t + g.total, 0)
  const lider = grupos[0]

  const exportar = () => {
    if (modo === 'resumido') {
      baixarCsv('ranking-resumido.csv', [['Posição', 'Consultor', 'Loja', 'Vendas', 'Faturado', 'Ticket médio', 'Desconto', 'Recebido', 'Participação %'],
        ...grupos.map((g) => [g.posicao, g.consultor, nomeLoja(g.loja), g.vendas.length, g.total, Math.round(g.ticket * 100) / 100, g.desconto, g.recebido, Math.round((g.total / (total || 1)) * 1000) / 10])])
    } else {
      baixarCsv('ranking-detalhado.csv', [['Consultor', 'Data', 'Venda', 'OS', 'Loja', 'Cliente', 'Tipo', 'Bruto', 'Desconto', 'Faturado', 'Recebido', 'Saldo'],
        ...grupos.flatMap((g) => g.vendas.map((v) => [g.consultor, dataHoraBR(v.data_venda), v.numero, v.os, nomeLoja(v.loja), v.cliente, TIPOS[v.tipo] || v.tipo, n(v.bruto), n(v.desconto), n(v.total), n(v.recebido), Math.max(n(v.total) - n(v.recebido), 0)]))])
    }
  }

  return (
    <>
      <Filtros consultores={consultores} consultor={consultor} setConsultor={setConsultor} tipo={tipo} setTipo={setTipo} modo={modo} setModo={setModo} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Faturado no período" valor={brl(total)} cor="text-brand" sub={`${vendas.length} venda${vendas.length === 1 ? '' : 's'}`} />
        <Kpi rotulo="Ticket médio" valor={brl(vendas.length ? total / vendas.length : 0)} />
        <Kpi rotulo="Descontos" valor={brl(grupos.reduce((t, g) => t + g.desconto, 0))} />
        <Kpi rotulo="Já recebido dessas vendas" valor={brl(grupos.reduce((t, g) => t + g.recebido, 0))} cor="text-ok" />
      </div>
      <Section title={modo === 'resumido' ? 'Ranking de consultores — faturado' : 'Ranking detalhado — vendas faturadas'} aside={<Button variant="secondary" size="sm" icon={Download} onClick={exportar}>Exportar</Button>}>
        {grupos.length === 0 ? <p className="text-sm text-muted">Nenhuma venda faturada com esses filtros.</p> : modo === 'resumido' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">#</th><th className="py-2 pr-3 font-medium">Consultor</th>
                  <th className="py-2 pr-3 text-right font-medium">Vendas</th><th className="py-2 pr-3 text-right font-medium">Faturado</th>
                  <th className="py-2 pr-3 text-right font-medium">Ticket médio</th><th className="py-2 pr-3 text-right font-medium">Desconto</th>
                  <th className="py-2 pr-3 text-right font-medium">Recebido</th><th className="py-2 text-right font-medium">Part.</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={g.consultor} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3"><Medalha posicao={g.posicao} /></td>
                    <td className="py-2 pr-3">
                      <p className="font-semibold">{g.consultor}</p>
                      <p className="text-xs text-muted">{isAdmin && `${nomeLoja(g.loja)} · `}{g.posicao > 1 ? `${brl(lider.total - g.total)} atrás do 1º` : 'Líder do período'}</p>
                    </td>
                    <td className="num py-2 pr-3 text-right">{g.vendas.length}</td>
                    <td className="num py-2 pr-3 text-right font-semibold">{brl(g.total)}</td>
                    <td className="num py-2 pr-3 text-right">{brl(g.ticket)}</td>
                    <td className="num py-2 pr-3 text-right">{g.desconto > 0 ? brl(g.desconto) : '—'}</td>
                    <td className="num py-2 pr-3 text-right">{brl(g.recebido)}</td>
                    <td className="num py-2 text-right text-muted">{pct(g.total, total)}</td>
                  </tr>
                ))}
                <tr><td /><td className="pt-3 font-semibold">Total</td><td className="num pt-3 text-right">{vendas.length}</td><td className="num pt-3 text-right font-bold text-brand">{brl(total)}</td><td colSpan={4} /></tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grupos.map((g) => (
              <div key={g.consultor} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                  <span className="flex items-center gap-2"><Medalha posicao={g.posicao} /><b>{g.consultor}</b>{isAdmin && <span className="text-xs text-muted">{nomeLoja(g.loja)}</span>}</span>
                  <span className="num text-sm">{g.vendas.length} vendas · <b className="text-brand">{brl(g.total)}</b></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="text-muted"><tr>
                      <th className="py-1 pr-3 font-medium">Data</th><th className="py-1 pr-3 font-medium">OS</th><th className="py-1 pr-3 font-medium">Cliente</th><th className="py-1 pr-3 font-medium">Tipo</th>
                      <th className="py-1 pr-3 text-right font-medium">Desconto</th><th className="py-1 pr-3 text-right font-medium">Faturado</th><th className="py-1 pr-3 text-right font-medium">Recebido</th><th className="py-1 text-right font-medium">Saldo</th>
                    </tr></thead>
                    <tbody>
                      {g.vendas.map((v) => {
                        const saldo = Math.max(n(v.total) - n(v.recebido), 0)
                        return (
                          <tr key={v.id} className="border-t border-line">
                            <td className="num py-1 pr-3 whitespace-nowrap">{dataHoraBR(v.data_venda)}</td>
                            <td className="num py-1 pr-3"><Link to={`/vendas/${v.id}`} className="font-semibold text-brand hover:underline">{v.os || `Venda ${v.numero}`}</Link></td>
                            <td className="py-1 pr-3">{v.cliente}</td>
                            <td className="py-1 pr-3">{TIPOS[v.tipo] || v.tipo}</td>
                            <td className="num py-1 pr-3 text-right">{n(v.desconto) > 0 ? brl(v.desconto) : '—'}</td>
                            <td className="num py-1 pr-3 text-right font-semibold">{brl(v.total)}</td>
                            <td className="num py-1 pr-3 text-right">{brl(v.recebido)}</td>
                            <td className="num py-1 text-right">{saldo > 0 ? <span className="rounded bg-danger px-2 py-0.5 font-bold text-surface">{brl(saldo)}</span> : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
      {isAdmin && modo === 'resumido' && !consultor && !tipo && (
        <Section title="Ranking de lojas">
          <Barras itens={d.ranking_lojas} rotulo={(l) => nomeLoja(l.loja)} valor={(l) => l.total}
            detalhe={(l) => `${brl(l.total)} · ${l.vendas} vendas · ticket ${brl(l.ticket)} ·`} />
        </Section>
      )}
    </>
  )
}

/* Comissão: tudo o que foi RECEBIDO no período (pela data do recebimento), por consultor */
function Comissionado({ recs, isAdmin }) {
  const pref = lerPref()
  const [modo, setModo] = useState('resumido')
  const [consultor, setConsultor] = useState('')
  const [tipo, setTipo] = useState('')
  const [forma, setForma] = useState('')
  const [taxa, setTaxa] = useState(pref.taxa ?? '2')
  const [taxas, setTaxas] = useState(pref.taxas || {})
  useEffect(() => { gravarPref({ ...lerPref(), taxa, taxas }) }, [taxa, taxas])
  const pctDe = (nome) => Number(String(taxas[nome] ?? taxa).replace(',', '.')) || 0

  const consultores = [...new Set(recs.map((r) => r.consultor))].sort()
  const formas = [...new Set(recs.map((r) => r.forma))].sort()
  const lista = recs.filter((r) => (!consultor || r.consultor === consultor) && (!tipo || r.tipo === tipo) && (!forma || r.forma === forma))
    .map((r) => ({ ...r, comissao: Math.round(n(r.valor) * pctDe(r.consultor)) / 100 }))
  const grupos = Object.values(lista.reduce((acc, r) => {
    const g = acc[r.consultor] || (acc[r.consultor] = { consultor: r.consultor, loja: r.loja, itens: [], recebido: 0, comissao: 0, saldos: 0 })
    g.itens.push(r); g.recebido += n(r.valor); g.comissao += r.comissao; if (r.saldo_posterior) g.saldos += n(r.valor)
    return acc
  }, {})).sort((a, b) => b.recebido - a.recebido)
  const totRec = grupos.reduce((t, g) => t + g.recebido, 0)
  const totCom = grupos.reduce((t, g) => t + g.comissao, 0)

  const exportar = () => {
    if (modo === 'resumido') baixarCsv('comissao-resumido.csv', [['Consultor', 'Loja', 'Recebimentos', 'Recebido', 'Dos quais saldos de vendas anteriores', '% comissão', 'Comissão'],
      ...grupos.map((g) => [g.consultor, nomeLoja(g.loja), g.itens.length, g.recebido, g.saldos, pctDe(g.consultor), Math.round(g.comissao * 100) / 100])])
    else baixarCsv('comissao-detalhado.csv', [['Consultor', 'Recebido em', 'Venda', 'OS', 'Data da venda', 'Loja', 'Cliente', 'Tipo', 'Forma', 'Parcelas', 'Valor recebido', '% comissão', 'Comissão'],
      ...lista.map((r) => [r.consultor, dataHoraBR(r.recebido_em), r.numero, r.os, dataHoraBR(r.data_venda), nomeLoja(r.loja), r.cliente, TIPOS[r.tipo] || r.tipo, nomeForma(r.forma), r.parcelas || '', n(r.valor), pctDe(r.consultor), r.comissao])])
  }

  return (
    <>
      <Filtros consultores={consultores} consultor={consultor} setConsultor={setConsultor} tipo={tipo} setTipo={setTipo}
        formas={formas} forma={forma} setForma={setForma} modo={modo} setModo={setModo}
        extra={<Field label="% padrão" className="w-24">{({ id }) => <Input id={id} inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value.replace(/[^\d,.]/g, ''))} />}</Field>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Recebido no período" valor={brl(totRec)} cor="text-ok" sub={`${lista.length} recebimento${lista.length === 1 ? '' : 's'}`} />
        <Kpi rotulo="Saldos de vendas anteriores" valor={brl(grupos.reduce((t, g) => t + g.saldos, 0))} sub="pagos neste período" />
        <Kpi rotulo="Comissões" valor={brl(totCom)} cor="text-brand" />
        <Kpi rotulo="Consultores" valor={grupos.length} />
      </div>
      <Section title={modo === 'resumido' ? 'Comissão por consultor — sobre o recebido' : 'Comissão detalhada — cada recebimento'} aside={<Button variant="secondary" size="sm" icon={Download} onClick={exportar}>Exportar</Button>}>
        <p className="mb-3 text-xs text-muted">Conta pela data em que o dinheiro entrou: o saldo pago na retirada entra na comissão do mês em que foi recebido. Garantia e cortesia não têm recebimento. A % por consultor fica salva neste computador.</p>
        {grupos.length === 0 ? <p className="text-sm text-muted">Nenhum recebimento com esses filtros.</p> : modo === 'resumido' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Consultor</th><th className="py-2 pr-3 text-right font-medium">Recebimentos</th>
                  <th className="py-2 pr-3 text-right font-medium">Recebido</th><th className="py-2 pr-3 text-right font-medium">Saldos anteriores</th>
                  <th className="py-2 pr-3 text-right font-medium">%</th><th className="py-2 text-right font-medium">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={g.consultor} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3"><p className="font-semibold">{g.consultor}</p>{isAdmin && <p className="text-xs text-muted">{nomeLoja(g.loja)}</p>}</td>
                    <td className="num py-2 pr-3 text-right">{g.itens.length}</td>
                    <td className="num py-2 pr-3 text-right font-semibold">{brl(g.recebido)}</td>
                    <td className="num py-2 pr-3 text-right text-muted">{g.saldos > 0 ? brl(g.saldos) : '—'}</td>
                    <td className="py-2 pr-3 text-right">
                      <input aria-label={`% de ${g.consultor}`} inputMode="decimal" className="num h-8 w-16 rounded-md border border-line bg-surface px-2 text-right focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                        value={taxas[g.consultor] ?? taxa} onChange={(e) => setTaxas((x) => ({ ...x, [g.consultor]: e.target.value.replace(/[^\d,.]/g, '') }))} />
                    </td>
                    <td className="num py-2 text-right font-bold text-brand">{brl(g.comissao)}</td>
                  </tr>
                ))}
                <tr><td className="pt-3 font-semibold">Total</td><td className="num pt-3 text-right">{lista.length}</td><td className="num pt-3 text-right font-bold">{brl(totRec)}</td><td colSpan={2} /><td className="num pt-3 text-right font-bold text-brand">{brl(totCom)}</td></tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Recebido em</th><th className="py-2 pr-3 font-medium">Consultor</th><th className="py-2 pr-3 font-medium">OS</th>
                  <th className="py-2 pr-3 font-medium">Cliente</th><th className="py-2 pr-3 font-medium">Venda em</th><th className="py-2 pr-3 font-medium">Forma</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor</th><th className="py-2 text-right font-medium">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="num whitespace-nowrap py-2 pr-3">{dataHoraBR(r.recebido_em)}</td>
                    <td className="py-2 pr-3">{r.consultor}</td>
                    <td className="num py-2 pr-3"><Link to={`/vendas/${r.venda_id}`} className="font-semibold text-brand hover:underline">{r.os || `Venda ${r.numero}`}</Link></td>
                    <td className="py-2 pr-3">{r.cliente}</td>
                    <td className="num py-2 pr-3">{dataHoraBR(r.data_venda).slice(0, 10)}{r.saldo_posterior && <span className="ml-1 rounded bg-accent/20 px-1.5 text-xs">saldo</span>}</td>
                    <td className="py-2 pr-3">{nomeForma(r.forma)}{r.parcelas > 1 ? ` ${r.parcelas}x` : ''}</td>
                    <td className="num py-2 pr-3 text-right font-semibold">{brl(r.valor)}</td>
                    <td className="num py-2 text-right text-brand">{brl(r.comissao)}</td>
                  </tr>
                ))}
                <tr><td className="pt-3 font-semibold" colSpan={6}>Total</td><td className="num pt-3 text-right font-bold">{brl(totRec)}</td><td className="num pt-3 text-right font-bold text-brand">{brl(totCom)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  )
}

function Analitico({ d }) {
  const ex = d.exame
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Vendas com receita do nosso exame" valor={ex.vendas} sub={`${pct(n(ex.vendas), n(ex.todas))} das vendas`} cor="text-brand" />
        <Kpi rotulo="Faturamento vindo do exame" valor={brl(ex.total)} />
        <Kpi rotulo="Melhor dia da semana" valor={d.por_dia_semana.length ? DIAS[[...d.por_dia_semana].sort((a, b) => n(b.total) - n(a.total))[0].dow] : '—'} />
        <Kpi rotulo="Horário que mais vende" valor={d.por_hora.length ? `${[...d.por_hora].sort((a, b) => n(b.total) - n(a.total))[0].hora}h` : '—'} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Por tipo de registro">
          <Barras itens={d.por_tipo} rotulo={(t) => TIPOS[t.tipo] || t.tipo} valor={(t) => t.qtd} detalhe={(t) => `${t.qtd} · ${brl(t.total)} ·`} />
        </Section>
        <Section title="Por categoria de produto">
          <Barras itens={d.por_produto} rotulo={(p) => PRODUTOS[p.tipo] || p.tipo} valor={(p) => p.total} detalhe={(p) => `${n(p.qtd)} un · ${brl(p.total)} ·`} cor="bg-accent" />
        </Section>
        <Section title="Por dia da semana">
          <Barras itens={d.por_dia_semana} rotulo={(x) => DIAS[x.dow]} valor={(x) => x.total} detalhe={(x) => `${x.vendas} vendas · ${brl(x.total)} ·`} />
        </Section>
        <Section title="Por horário">
          <Barras itens={d.por_hora} rotulo={(x) => `${String(x.hora).padStart(2, '0')}h`} valor={(x) => x.total} detalhe={(x) => `${x.vendas} vendas · ${brl(x.total)} ·`} />
        </Section>
        <Section title="Por origem do cliente">
          <Barras itens={d.por_origem} rotulo={(x) => x.origem} valor={(x) => x.total} detalhe={(x) => `${x.vendas} vendas · ${brl(x.total)} ·`} cor="bg-accent" />
        </Section>
      </div>
    </>
  )
}

function baixarCsv(nome, linhas) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function Detalhado({ d, isAdmin }) {
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return d.detalhado.filter((v) => (!tipo || v.tipo === tipo) &&
      (!t || [v.cliente, v.consultor, v.os, String(v.numero)].some((x) => (x || '').toLowerCase().includes(t))))
  }, [d.detalhado, busca, tipo])
  const soma = (k) => linhas.filter((v) => v.status !== 'cancelada').reduce((s, v) => s + n(v[k]), 0)
  const formasTxt = (f) => (f || '').split(', ').filter(Boolean).map(nomeForma).join(', ')

  const exportar = () => {
    const cab = ['Data', 'Venda', 'OS', 'Loja', 'Consultor', 'Cliente', 'Tipo', 'Status', 'Bruto', 'Desconto', 'Total', 'Recebido', 'Saldo', 'Formas', 'Origem', 'Receita do exame']
    const lin = linhas.map((v) => [dataHoraBR(v.data_venda), v.numero, v.os, nomeLoja(v.loja), v.consultor, v.cliente, TIPOS[v.tipo] || v.tipo, v.status,
      n(v.bruto), n(v.desconto), n(v.total), n(v.recebido), Math.max(n(v.total) - n(v.recebido), 0), formasTxt(v.formas), v.origem, v.receita_exame ? 'Sim' : 'Não'])
    baixarCsv('vendas-detalhado.csv', [cab, ...lin])
  }

  return (
    <Section title={`Todas as vendas e registros (${linhas.length})`} aside={<Button variant="secondary" size="sm" icon={Download} onClick={exportar}>Exportar planilha</Button>}>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Buscar" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, consultor, OS ou nº" />
        </div>
        <Field label="Tipo" className="w-48">
          {({ id }) => (
            <Select id={id} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          )}
        </Field>
      </div>
      {linhas.length === 0 ? <Empty title="Nada encontrado" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Data</th><th className="py-2 pr-3 font-medium">OS</th>
                {isAdmin && <th className="py-2 pr-3 font-medium">Loja</th>}
                <th className="py-2 pr-3 font-medium">Consultor</th><th className="py-2 pr-3 font-medium">Cliente</th><th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 text-right font-medium">Desconto</th><th className="py-2 pr-3 text-right font-medium">Total</th>
                <th className="py-2 pr-3 text-right font-medium">Recebido</th><th className="py-2 pr-3 text-right font-medium">Saldo</th><th className="py-2 font-medium">Formas</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((v) => {
                const saldo = Math.max(n(v.total) - n(v.recebido), 0)
                return (
                  <tr key={v.id} className={cx('border-b border-line align-top last:border-0', v.status === 'cancelada' && 'text-muted line-through')}>
                    <td className="num whitespace-nowrap py-2 pr-3">{dataHoraBR(v.data_venda)}</td>
                    <td className="num py-2 pr-3"><Link to={`/vendas/${v.id}`} className="font-semibold text-brand hover:underline">{v.os || `Venda ${v.numero}`}</Link></td>
                    {isAdmin && <td className="py-2 pr-3">{nomeLoja(v.loja)}</td>}
                    <td className="py-2 pr-3">{v.consultor}</td>
                    <td className="py-2 pr-3">{v.cliente}{v.receita_exame && <span className="ml-1 rounded bg-brand-soft px-1.5 text-xs text-brand">exame</span>}</td>
                    <td className="py-2 pr-3">{TIPOS[v.tipo] || v.tipo}</td>
                    <td className="num py-2 pr-3 text-right">{n(v.desconto) > 0 ? brl(v.desconto) : '—'}</td>
                    <td className="num py-2 pr-3 text-right font-semibold">{brl(v.total)}</td>
                    <td className="num py-2 pr-3 text-right">{brl(v.recebido)}</td>
                    <td className="num py-2 pr-3 text-right">{saldo > 0 && v.status !== 'cancelada' ? <span className="rounded bg-danger px-2 py-0.5 font-bold text-surface">{brl(saldo)}</span> : '—'}</td>
                    <td className="py-2 text-xs">{formasTxt(v.formas) || '—'}</td>
                  </tr>
                )
              })}
              <tr>
                <td className="pt-3 font-semibold" colSpan={isAdmin ? 6 : 5}>Totais (sem canceladas)</td>
                <td className="num pt-3 text-right">{brl(soma('desconto'))}</td>
                <td className="num pt-3 text-right font-bold">{brl(soma('total'))}</td>
                <td className="num pt-3 text-right">{brl(soma('recebido'))}</td>
                <td className="num pt-3 text-right font-bold text-danger">{brl(Math.max(soma('total') - soma('recebido'), 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

export default function RelatoriosExtra({ visao, ini, fim, loja, isAdmin }) {
  const [d, setD] = useState(null)
  const [erro, setErro] = useState(null)
  const [recs, setRecs] = useState(null)
  useEffect(() => {
    let ativo = true
    setD(null); setRecs(null)
    const args = { p_ini: ini.toISOString(), p_fim: fim.toISOString(), p_loja: loja || null }
    Promise.all([supabase.rpc('relatorio_extra', args), supabase.rpc('relatorio_recebimentos', args)]).then(([a, b]) => {
      if (!ativo) return
      const error = a.error || b.error
      if (error) { setErro(mensagemErro(error)); setD({}); setRecs([]); return }
      setErro(null); setD(a.data); setRecs(b.data || [])
    })
    return () => { ativo = false }
  }, [ini.getTime(), fim.getTime(), loja]) // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <Alert>{erro}</Alert>
  if (!d || !recs) return <Spinner label="Calculando relatório" />
  if (visao === 'comissionado') return <Comissionado recs={recs} isAdmin={isAdmin} />
  if (!d.detalhado?.length) return <Empty title="Nenhum registro nesse período">Escolha outro período para ver os números.</Empty>
  if (visao === 'ranking') return <Ranking d={d} isAdmin={isAdmin} />
  if (visao === 'analitico') return <Analitico d={d} />
  return <Detalhado d={d} isAdmin={isAdmin} />
}
