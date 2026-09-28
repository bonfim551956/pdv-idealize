import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlusCircle, Search } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { brl, dataHoraBR, STATUS_OS } from '../lib/format'
import { Button, Input, Spinner, Empty, Alert, Chips, cx } from '../components/ui'

const FILTROS = [
  { value: 'a_receber', label: 'Com saldo a receber' },
  { value: 'confirmada', label: 'Confirmadas' },
  { value: 'cancelada', label: 'Canceladas' },
]

export function StatusVenda({ status }) {
  const map = {
    aberta: 'bg-warn-soft text-warn',
    confirmada: 'bg-ok-soft text-ok',
    cancelada: 'bg-danger-soft text-danger',
  }
  const label = { aberta: 'Aberta', confirmada: 'Confirmada', cancelada: 'Cancelada' }
  return <span className={cx('inline-flex rounded px-2 py-0.5 text-xs font-semibold', map[status])}>{label[status]}</span>
}

export default function Vendas() {
  const nav = useNavigate()
  const [vendas, setVendas] = useState(null)
  const [erro, setErro] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState(null)

  useEffect(() => {
    let ativo = true
    const t = setTimeout(async () => {
      let q = supabase.from('v_vendas_lista').select('*').order('data_venda', { ascending: false }).limit(100)
      const b = busca.trim()
      if (b) q = /^\d+$/.test(b) ? q.eq('numero', Number(b)) : q.ilike('cliente', `%${b}%`)
      if (filtro === 'confirmada' || filtro === 'cancelada') q = q.eq('status', filtro)
      const { data, error } = await q
      if (!ativo) return
      if (error) { setErro(mensagemErro(error)); setVendas([]); return }
      setErro(null)
      setVendas(filtro === 'a_receber' ? data.filter((v) => v.status === 'confirmada' && Number(v.total) - Number(v.recebido) > 0) : data)
    }, 250)
    return () => { ativo = false; clearTimeout(t) }
  }, [busca, filtro])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-bold">Vendas</h1>
        <Button icon={PlusCircle} onClick={() => nav('/nova-venda')}>Nova venda</Button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Buscar venda" className="pl-9" placeholder="Buscar por cliente ou nº da venda" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Chips label="Filtrar vendas" options={FILTROS} value={filtro} onChange={setFiltro} />
      </div>

      {erro && <Alert>{erro}</Alert>}
      {vendas === null ? (
        <Spinner />
      ) : vendas.length === 0 ? (
        <Empty title={busca || filtro ? 'Nenhuma venda encontrada' : 'Nenhuma venda registrada ainda'} action={!busca && !filtro && <Button icon={PlusCircle} onClick={() => nav('/nova-venda')}>Registrar a primeira venda</Button>}>
          {busca || filtro ? 'Ajuste a busca ou remova o filtro.' : 'As vendas das lojas aparecem aqui assim que forem confirmadas.'}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Nº</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Loja / vendedor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">OS</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">A receber</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v) => {
                const saldo = Number(v.total) - Number(v.recebido)
                return (
                  <tr key={v.id} className="border-b border-line last:border-0 hover:bg-bg">
                    <td className="px-4 py-3 num font-semibold">
                      <Link to={`/vendas/${v.id}`} className="text-brand hover:underline">{v.numero}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{v.cliente}</p>
                      <p className="text-xs text-muted">{dataHoraBR(v.data_venda)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{v.loja?.replace('Óticas Idealize ', '')}</p>
                      <p className="text-xs text-muted">{v.vendedor}</p>
                    </td>
                    <td className="px-4 py-3"><StatusVenda status={v.status} /></td>
                    <td className="px-4 py-3 text-muted">{v.status_os ? STATUS_OS[v.status_os] : '—'}</td>
                    <td className="px-4 py-3 text-right num">{brl(v.total)}</td>
                    <td className={cx('px-4 py-3 text-right num font-semibold', saldo > 0 && v.status === 'confirmada' ? 'text-danger' : 'text-muted')}>
                      {v.status === 'cancelada' ? '—' : brl(saldo)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
