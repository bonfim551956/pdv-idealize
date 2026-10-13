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

function Ranking({ d, isAdmin }) {
  const lider = d.ranking[0]
  const total = d.ranking.reduce((s, c) => s + n(c.total), 0)
  return (
    <>
      <Section title="Ranking de consultores">
        {d.ranking.length === 0 ? <p className="text-sm text-muted">Sem vendas no período.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">#</th><th className="py-2 pr-3 font-medium">Consultor</th>
                  <th className="py-2 pr-3 text-right font-medium">Vendas</th><th className="py-2 pr-3 text-right font-medium">Faturamento</th>
                  <th className="py-2 pr-3 text-right font-medium">Ticket médio</th><th className="py-2 pr-3 text-right font-medium">Lentes</th>
                  <th className="py-2 pr-3 text-right font-medium">Armações</th><th className="py-2 pr-3 text-right font-medium">Desconto</th>
                  <th className="py-2 text-right font-medium">Part.</th>
                </tr>
              </thead>
              <tbody>
                {d.ranking.map((c) => (
                  <tr key={c.vendedor_id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3"><Medalha posicao={c.posicao} /></td>
                    <td className="py-2 pr-3">
                      <p className="font-semibold">{c.consultor}</p>
                      <p className="text-xs text-muted">{isAdmin && `${nomeLoja(c.loja)} · `}{c.garantias > 0 && `${c.garantias} garantia/cortesia · `}{c.canceladas > 0 && `${c.canceladas} cancelada(s) · `}{lider && c.posicao > 1 ? `${brl(n(lider.total) - n(c.total))} atrás do 1º` : 'Líder do período'}</p>
                    </td>
                    <td className="num py-2 pr-3 text-right">{c.vendas}</td>
                    <td className="num py-2 pr-3 text-right font-semibold">{brl(c.total)}</td>
                    <td className="num py-2 pr-3 text-right">{brl(c.ticket)}</td>
                    <td className="num py-2 pr-3 text-right">{n(c.lentes)}</td>
                    <td className="num py-2 pr-3 text-right">{n(c.armacoes)}</td>
                    <td className="num py-2 pr-3 text-right">{pct(n(c.desconto), n(c.bruto))}</td>
                    <td className="num py-2 text-right text-muted">{pct(n(c.total), total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {isAdmin && (
        <Section title="Ranking de lojas">
          <Barras itens={d.ranking_lojas} rotulo={(l) => nomeLoja(l.loja)} valor={(l) => l.total}
            detalhe={(l) => `${brl(l.total)} · ${l.vendas} vendas · ticket ${brl(l.ticket)} ·`} />
        </Section>
      )}
    </>
  )
}

function Comissionado({ d, isAdmin }) {
  const pref = lerPref()
  const [base, setBase] = useState(pref.base || 'vendido')
  const [taxa, setTaxa] = useState(pref.taxa ?? '2')
  const [taxas, setTaxas] = useState(pref.taxas || {})
  useEffect(() => { gravarPref({ base, taxa, taxas }) }, [base, taxa, taxas])

  const linhas = d.ranking.map((c) => {
    const t = Number(String(taxas[c.vendedor_id] ?? taxa).replace(',', '.')) || 0
    const valorBase = base === 'recebido' ? n(c.recebido) : n(c.total)
    return { ...c, t, valorBase, comissao: Math.round(valorBase * t) / 100 }
  })
  const total = linhas.reduce((s, l) => s + l.comissao, 0)

  const exportar = () => {
    const cab = ['Consultor', 'Loja', 'Vendas', 'Faturamento', 'Recebido', 'Desconto', 'Base', '% comissão', 'Comissão']
    const lin = linhas.map((l) => [l.consultor, nomeLoja(l.loja), l.vendas, l.total, l.recebido, l.desconto, l.valorBase, l.t, l.comissao])
    baixarCsv('comissao.csv', [cab, ...lin])
  }

  return (
    <Section title="Comissão por consultor" aside={<Button variant="secondary" size="sm" icon={Download} onClick={exportar}>Exportar</Button>}>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Chips label="Calcular sobre" options={[{ value: 'vendido', label: 'Valor vendido' }, { value: 'recebido', label: 'Valor recebido' }]} value={base} onChange={(v) => v && setBase(v)} />
        <Field label="% padrão" className="w-28">{({ id }) => <Input id={id} inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value.replace(/[^\d,.]/g, ''))} />}</Field>
        <p className="max-w-sm text-xs text-muted">Garantia e cortesia não entram. A % pode ser ajustada por consultor e fica salva neste computador.</p>
      </div>
      {linhas.length === 0 ? <p className="text-sm text-muted">Sem vendas no período.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Consultor</th><th className="py-2 pr-3 text-right font-medium">Vendas</th>
                <th className="py-2 pr-3 text-right font-medium">Vendido</th><th className="py-2 pr-3 text-right font-medium">Recebido</th>
                <th className="py-2 pr-3 text-right font-medium">%</th><th className="py-2 text-right font-medium">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.vendedor_id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3"><p className="font-semibold">{l.consultor}</p>{isAdmin && <p className="text-xs text-muted">{nomeLoja(l.loja)}</p>}</td>
                  <td className="num py-2 pr-3 text-right">{l.vendas}</td>
                  <td className={cx('num py-2 pr-3 text-right', base === 'vendido' && 'font-semibold')}>{brl(l.total)}</td>
                  <td className={cx('num py-2 pr-3 text-right', base === 'recebido' && 'font-semibold')}>{brl(l.recebido)}</td>
                  <td className="py-2 pr-3 text-right">
                    <input aria-label={`% de ${l.consultor}`} inputMode="decimal" className="num h-8 w-16 rounded-md border border-line bg-surface px-2 text-right focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      value={taxas[l.vendedor_id] ?? taxa} onChange={(e) => setTaxas((x) => ({ ...x, [l.vendedor_id]: e.target.value.replace(/[^\d,.]/g, '') }))} />
                  </td>
                  <td className="num py-2 text-right font-bold text-brand">{brl(l.comissao)}</td>
                </tr>
              ))}
              <tr><td className="pt-3 font-semibold" colSpan={5}>Total de comissões</td><td className="num pt-3 text-right font-bold text-brand">{brl(total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
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
  useEffect(() => {
    let ativo = true
    setD(null)
    supabase.rpc('relatorio_extra', { p_ini: ini.toISOString(), p_fim: fim.toISOString(), p_loja: loja || null }).then(({ data, error }) => {
      if (!ativo) return
      if (error) { setErro(mensagemErro(error)); setD({}); return }
      setErro(null); setD(data)
    })
    return () => { ativo = false }
  }, [ini.getTime(), fim.getTime(), loja]) // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <Alert>{erro}</Alert>
  if (!d) return <Spinner label="Calculando relatório" />
  if (!d.detalhado?.length) return <Empty title="Nenhum registro nesse período">Escolha outro período para ver os números.</Empty>
  if (visao === 'ranking') return <Ranking d={d} isAdmin={isAdmin} />
  if (visao === 'comissionado') return <Comissionado d={d} isAdmin={isAdmin} />
  if (visao === 'analitico') return <Analitico d={d} />
  return <Detalhado d={d} isAdmin={isAdmin} />
}
