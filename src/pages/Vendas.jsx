import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlusCircle, Search, Download, ChevronRight } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { brl, dataBR, dataHoraBR, STATUS_OS } from '../lib/format'
import { Button, Input, Select, Spinner, Empty, Alert, Chips, Field, cx } from '../components/ui'

const LIMITE = 500
const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mes_ant', label: 'Mês passado' },
  { value: 'tudo', label: 'Tudo' },
  { value: 'custom', label: 'Período' },
]
const SITUACOES = [
  { value: 'saldo', label: 'Com saldo a receber' },
  { value: 'quitada', label: 'Quitadas' },
  { value: 'cancelada', label: 'Canceladas' },
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
    case 'custom': return [de ? new Date(`${de}T00:00:00`) : null, ate ? soma(new Date(`${ate}T00:00:00`), 1) : null]
    default: return [null, null]
  }
}

export function StatusVenda({ status }) {
  const map = { aberta: 'bg-warn-soft text-warn', confirmada: 'bg-ok-soft text-ok', cancelada: 'bg-danger-soft text-danger' }
  const label = { aberta: 'Aberta', confirmada: 'Confirmada', cancelada: 'Cancelada' }
  return <span className={cx('inline-flex rounded px-2 py-0.5 text-xs font-semibold', map[status])}>{label[status]}</span>
}

function Indicador({ rotulo, valor, destaque }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 p-4">
      <span className="text-xs font-medium text-muted">{rotulo}</span>
      <span className={cx('num truncate font-display text-lg font-bold', destaque)}>{valor}</span>
    </div>
  )
}

export default function Vendas() {
  const nav = useNavigate()
  const { isAdmin } = useAuth()
  const [vendas, setVendas] = useState(null)
  const [erro, setErro] = useState(null)
  const [busca, setBusca] = useState('')
  const [periodo, setPeriodo] = useState('mes')
  const [de, setDe] = useState(isoLocal(new Date()))
  const [ate, setAte] = useState(isoLocal(new Date()))
  const [situacao, setSituacao] = useState(null)
  const [statusOS, setStatusOS] = useState('')
  const [consultor, setConsultor] = useState('')
  const [loja, setLoja] = useState('')
  const [consultores, setConsultores] = useState([])
  const [lojas, setLojas] = useState([])

  useEffect(() => {
    supabase.from('colaboradores').select('id, nome, loja_id').eq('ativo', true).order('nome').then(({ data }) => setConsultores(data || []))
    if (isAdmin) supabase.from('lojas').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setLojas(data || []))
  }, [isAdmin])

  useEffect(() => {
    let ativo = true
    const t = setTimeout(async () => {
      setVendas(null)
      let q = supabase.from('v_vendas_lista').select('*').order('data_venda', { ascending: false }).limit(LIMITE)
      const b = busca.trim()
      const dig = b.replace(/\D/g, '')
      if (b) {
        // Busca inteligente: CPF (11 dígitos), nº da venda ou da OS, ou nome do cliente
        if (/^[\d.\-\s]+$/.test(b) && dig.length === 11) q = q.eq('cliente_documento', dig)
        else if (/^\d+$/.test(b)) q = q.or(`numero.eq.${b},os_numeros.cs.{${b}}`)
        else q = q.ilike('cliente', `%${b.replace(/[%,()]/g, ' ')}%`)
      }
      // período só vale quando não há busca direta por número/CPF
      if (!b || !/^[\d.\-\s]+$/.test(b)) {
        const [ini, fim] = intervalo(periodo, de, ate)
        if (ini) q = q.gte('data_venda', ini.toISOString())
        if (fim) q = q.lt('data_venda', fim.toISOString())
      }
      if (situacao === 'cancelada') q = q.eq('status', 'cancelada')
      else if (situacao) q = q.eq('status', 'confirmada')
      if (statusOS) q = q.eq('status_os', statusOS)
      if (consultor) q = q.eq('vendedor_id', consultor)
      if (loja) q = q.eq('loja_id', loja)
      const { data, error } = await q
      if (!ativo) return
      if (error) { setErro(mensagemErro(error)); setVendas([]); return }
      setErro(null)
      let lista = data
      if (situacao === 'saldo') lista = lista.filter((v) => Number(v.total) - Number(v.recebido) > 0.004)
      if (situacao === 'quitada') lista = lista.filter((v) => Number(v.total) - Number(v.recebido) <= 0.004)
      setVendas(lista)
    }, 300)
    return () => { ativo = false; clearTimeout(t) }
  }, [busca, periodo, de, ate, situacao, statusOS, consultor, loja])

  const resumo = useMemo(() => {
    const validas = (vendas || []).filter((v) => v.status !== 'cancelada')
    const total = validas.reduce((s, v) => s + Number(v.total), 0)
    const recebido = validas.reduce((s, v) => s + Number(v.recebido), 0)
    return { qtd: validas.length, total, recebido, aReceber: total - recebido, ticket: validas.length ? total / validas.length : 0 }
  }, [vendas])

  const consultoresVisiveis = loja ? consultores.filter((c) => c.loja_id === loja) : consultores
  const filtrosAtivos = busca || situacao || statusOS || consultor || loja

  const exportarCSV = () => {
    const linhas = [['Venda', 'Data', 'Loja', 'Consultor', 'Cliente', 'CPF', 'OS', 'Status OS', 'Status', 'Total', 'Recebido', 'A receber']]
    for (const v of vendas) {
      linhas.push([v.numero, dataHoraBR(v.data_venda), v.loja, v.vendedor, v.cliente, v.cliente_documento || '', v.os_numeros.join(' '),
        v.status_os ? STATUS_OS[v.status_os] : '', v.status, Number(v.total).toFixed(2).replace('.', ','),
        Number(v.recebido).toFixed(2).replace('.', ','), (Number(v.total) - Number(v.recebido)).toFixed(2).replace('.', ',')])
    }
    const csv = '\uFEFF' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `vendas-idealize-${isoLocal(new Date())}.csv`
    a.click()
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-bold">Vendas</h1>
        <div className="flex gap-2">
          {vendas?.length > 0 && <Button variant="secondary" icon={Download} onClick={exportarCSV}>Exportar</Button>}
          <Button icon={PlusCircle} onClick={() => nav('/nova-venda')}>Nova venda</Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Buscar venda" className="pl-9" placeholder="Nome do cliente, CPF, nº da venda ou nº da OS" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Chips label="Período" options={PERIODOS} value={periodo} onChange={(v) => v && setPeriodo(v)} />
        {periodo === 'custom' && (
          <div className="grid max-w-md grid-cols-2 gap-4">
            <Field label="De">{({ id }) => <Input id={id} type="date" value={de} onChange={(e) => setDe(e.target.value)} />}</Field>
            <Field label="Até">{({ id }) => <Input id={id} type="date" value={ate} onChange={(e) => setAte(e.target.value)} />}</Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isAdmin && (
            <Select aria-label="Loja" value={loja} onChange={(e) => { setLoja(e.target.value); setConsultor('') }}>
              <option value="">Todas as lojas</option>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome.replace('Óticas Idealize ', '')}</option>)}
            </Select>
          )}
          <Select aria-label="Consultor" value={consultor} onChange={(e) => setConsultor(e.target.value)}>
            <option value="">Todos os consultores</option>
            {consultoresVisiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Select aria-label="Situação da OS" value={statusOS} onChange={(e) => setStatusOS(e.target.value)}>
            <option value="">Todas as situações de OS</option>
            {Object.entries(STATUS_OS).filter(([k]) => k !== 'rascunho').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
        <Chips label="Situação da venda" options={SITUACOES} value={situacao} onChange={setSituacao} />
      </div>

      {/* Resumo do período */}
      {vendas && vendas.length > 0 && (
        <div className="grid grid-cols-2 divide-line overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-5 sm:divide-x">
          <Indicador rotulo="Vendas" valor={resumo.qtd} />
          <Indicador rotulo="Total vendido" valor={brl(resumo.total)} destaque="text-brand" />
          <Indicador rotulo="Recebido" valor={brl(resumo.recebido)} destaque="text-ok" />
          <Indicador rotulo="A receber" valor={brl(resumo.aReceber)} destaque={resumo.aReceber > 0 ? 'text-danger' : ''} />
          <Indicador rotulo="Ticket médio" valor={brl(resumo.ticket)} />
        </div>
      )}

      {erro && <Alert>{erro}</Alert>}
      {vendas === null ? (
        <Spinner label="Buscando vendas" />
      ) : vendas.length === 0 ? (
        <Empty title="Nenhuma venda encontrada" action={!filtrosAtivos && periodo !== 'tudo' && <Button variant="secondary" onClick={() => setPeriodo('tudo')}>Ver todas as vendas</Button>}>
          {filtrosAtivos ? 'Ajuste a busca ou os filtros.' : 'Não há vendas nesse período.'}
        </Empty>
      ) : (
        <>
          {vendas.length === LIMITE && <Alert tone="warn">Mostrando as {LIMITE} vendas mais recentes. Use os filtros para refinar.</Alert>}

          {/* Desktop: tabela; a linha inteira abre a venda */}
          <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Venda</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">OS</th>
                  <th className="px-4 py-3 font-medium">Consultor</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">A receber</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => {
                  const saldo = Number(v.total) - Number(v.recebido)
                  return (
                    <tr key={v.id} onClick={() => nav(`/vendas/${v.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-brand-soft/60">
                      <td className="px-4 py-3">
                        <Link to={`/vendas/${v.id}`} onClick={(e) => e.stopPropagation()} className="num font-display font-bold text-brand hover:underline">{v.numero}</Link>
                        <p className="num text-xs text-muted">{dataHoraBR(v.data_venda)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{v.cliente}</p>
                        <div className="mt-0.5"><StatusVenda status={v.status} /></div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="num font-medium">{v.os_numeros.length ? v.os_numeros.map((n) => `nº ${n}`).join(', ') : '—'}</p>
                        {v.status_os && <p className="text-xs text-muted">{STATUS_OS[v.status_os]}{v.previsao_entrega ? ` · retirada ${dataBR(v.previsao_entrega)}` : ''}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p>{v.vendedor}</p>
                        {isAdmin && <p className="text-xs text-muted">{v.loja.replace('Óticas Idealize ', '')}</p>}
                      </td>
                      <td className="num px-4 py-3 text-right">{brl(v.total)}</td>
                      <td className={cx('num px-4 py-3 text-right font-semibold', v.status === 'confirmada' && saldo > 0.004 ? 'text-danger' : 'text-muted')}>
                        {v.status === 'cancelada' ? '—' : saldo > 0.004 ? brl(saldo) : 'Quitada'}
                      </td>
                      <td className="pr-3 text-muted"><ChevronRight className="h-4 w-4" aria-hidden /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: cartões */}
          <ul className="flex flex-col gap-2 md:hidden">
            {vendas.map((v) => {
              const saldo = Number(v.total) - Number(v.recebido)
              return (
                <li key={v.id}>
                  <Link to={`/vendas/${v.id}`} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 active:bg-brand-soft">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num font-display font-bold text-brand">Venda {v.numero}</span>
                      <StatusVenda status={v.status} />
                    </div>
                    <p className="font-medium">{v.cliente}</p>
                    <div className="flex items-end justify-between gap-2 text-sm">
                      <span className="text-muted">{dataBR(v.data_venda)} · {v.vendedor}{v.os_numeros.length ? ` · OS ${v.os_numeros.join(', ')}` : ''}</span>
                      <span className="num text-right font-semibold">
                        {brl(v.total)}
                        {v.status === 'confirmada' && saldo > 0.004 && <span className="block text-xs text-danger">falta {brl(saldo)}</span>}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
