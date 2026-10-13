import { useEffect, useState } from 'react'
import { Search, Stethoscope } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Modal, Input, Spinner, Alert } from '../../components/ui'
import { grau, parseNum } from '../../lib/format'

/*
  Busca a receita feita no nosso exame (sistema de agendamento, tabela public.receitas)
  por telefone ou nome do paciente. O exame não guarda CPF, então o vínculo é telefone + nome.
*/

const num = (v) => {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/\s/g, '')
  if (!s || /^n\/?a$/i.test(s) || s === '-') return null
  const n = parseNum(s)
  return n === null || Number.isNaN(n) ? null : n
}
const txtGrau = (v) => { const n = num(v); return n === null ? '' : grau(n) }
const txtInt = (v) => { const n = num(v); return n === null ? '' : String(Math.round(n)) }
const txtDnp = (v) => { const n = num(v); return n === null ? '' : String(n).replace('.', ',') }

// Converte a linha do exame para o formato do formulário da OS
export function receitaDoExame(r) {
  const olho = (p) => {
    const esf = num(r[`${p}_esf`]); const add = num(r[`${p}_adicao`])
    return {
      esferico_longe: txtGrau(r[`${p}_esf`]),
      cilindrico: txtGrau(r[`${p}_cil`]),
      eixo: txtInt(r[`${p}_eixo`]),
      adicao: txtGrau(r[`${p}_adicao`]),
      esferico_perto: esf !== null && add ? grau(Math.round((esf + add) * 100) / 100) : '',
    }
  }
  return {
    receita: { OD: olho('od'), OE: olho('oe') },
    dnp: { OD: txtDnp(r.od_dnp), OE: txtDnp(r.oe_dnp) },
    data: /^\d{4}-\d{2}-\d{2}/.test(r.data || '') ? r.data.slice(0, 10) : null,
  }
}

const dataBR = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(0, 10).split('-').reverse().join('/') : s || '')

function Linha({ r, onUsar }) {
  const cel = (p, k) => <td className="num px-2 py-1 text-right">{r[`${p}_${k}`] || '—'}</td>
  return (
    <button type="button" onClick={() => onUsar(r)} className="w-full rounded-lg border border-line p-3 text-left transition-colors hover:border-brand hover:bg-brand-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold capitalize text-ink">{r.paciente_nome}</span>
        <span className="text-xs text-muted">Exame {dataBR(r.data)}{r.opto_nome ? ` · ${r.opto_nome}` : ''}{r.unidade ? ` · ${r.unidade}` : ''}</span>
      </div>
      {r.telefone && <p className="text-xs text-muted">{r.telefone}</p>}
      <table className="mt-2 w-full text-xs">
        <thead className="text-muted"><tr><th className="text-left font-medium" /><th className="px-2 text-right font-medium">Esf.</th><th className="px-2 text-right font-medium">Cil.</th><th className="px-2 text-right font-medium">Eixo</th><th className="px-2 text-right font-medium">Adição</th><th className="px-2 text-right font-medium">DNP</th></tr></thead>
        <tbody>
          {['od', 'oe'].map((p) => (
            <tr key={p}><td className="font-semibold uppercase">{p}</td>{cel(p, 'esf')}{cel(p, 'cil')}{cel(p, 'eixo')}{cel(p, 'adicao')}{cel(p, 'dnp')}</tr>
          ))}
        </tbody>
      </table>
      {r.observacoes && <p className="mt-1 text-xs text-muted">Obs.: {r.observacoes}</p>}
    </button>
  )
}

export default function ReceitaExameModal({ open, onOpenChange, buscaInicial = '', onUsar }) {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => { if (open) setBusca(buscaInicial) }, [open, buscaInicial])

  useEffect(() => {
    if (!open) return
    const termo = busca.trim()
    const dig = termo.replace(/\D/g, '')
    if (dig.length < 8 && termo.length < 3) { setLista(null); return }
    const t = setTimeout(async () => {
      setCarregando(true); setErro(null)
      const { data, error } = await supabase.rpc('buscar_receitas_exame', { p_busca: termo })
      setCarregando(false)
      if (error) { setErro('Não foi possível buscar as receitas agora.'); setLista([]); return }
      setLista(data || [])
    }, 350)
    return () => clearTimeout(t)
  }, [busca, open])

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Receita do nosso exame" wide>
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input autoFocus className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Telefone ou nome do paciente" />
        </div>
        {erro && <Alert>{erro}</Alert>}
        {carregando && <Spinner label="Buscando receitas" />}
        {!carregando && lista === null && <p className="text-sm text-muted">Digite o telefone (com DDD) ou pelo menos 3 letras do nome.</p>}
        {!carregando && lista?.length === 0 && !erro && <p className="text-sm text-muted">Nenhuma receita do exame encontrada para essa busca.</p>}
        {!carregando && lista?.length > 0 && (
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {lista.map((r) => <Linha key={r.id} r={r} onUsar={(x) => { onUsar(x); onOpenChange(false) }} />)}
          </div>
        )}
        <p className="flex items-center gap-2 text-xs text-muted"><Stethoscope className="h-3.5 w-3.5" />Ao escolher, graus, DNP e data preenchem a OS. Confira com a receita impressa antes de confirmar.</p>
      </div>
    </Modal>
  )
}
