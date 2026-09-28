import { Minus, Plus, Copy } from 'lucide-react'
import { CAMPOS_RECEITA, validarOlho, sugerirPerto } from '../../lib/receita'
import { grau, parseNum } from '../../lib/format'
import { cx } from '../../components/ui'

const OLHOS = [
  { key: 'OD', nome: 'Olho direito', rail: 'bg-od', chip: 'bg-od text-surface', soft: 'bg-od-soft' },
  { key: 'OE', nome: 'Olho esquerdo', rail: 'bg-oe', chip: 'bg-oe text-surface', soft: 'bg-oe-soft' },
]

function CampoGrau({ campo, valor, onChange, erro, olho, placeholder }) {
  const passo = (d) => {
    const atual = parseNum(valor)
    const base = atual === null || Number.isNaN(atual) ? 0 : atual
    const n = Math.round((base + d) * 100) / 100
    onChange(campo.grau ? grau(n) : String(Math.min(campo.max, Math.max(campo.min, Math.round(n)))))
  }
  const formatar = () => {
    const v = parseNum(valor)
    if (v === null) { onChange(''); return }
    if (!Number.isNaN(v) && campo.grau) onChange(grau(v))
  }
  const id = `rx-${olho}-${campo.key}`
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted lg:sr-only">{campo.label}</label>
      <div className={cx('flex h-12 items-stretch overflow-hidden rounded-md border bg-surface', erro ? 'border-danger' : 'border-line focus-within:border-brand')}>
        {campo.grau && (
          <button type="button" tabIndex={-1} onClick={() => passo(-0.25)} className="w-8 shrink-0 text-muted hover:bg-bg hover:text-ink" aria-label={`Diminuir ${campo.label} ${olho}`}>
            <Minus className="mx-auto h-3 w-3" />
          </button>
        )}
        <input
          id={id}
          inputMode={campo.grau ? 'decimal' : 'numeric'}
          value={valor}
          placeholder={placeholder ?? (campo.grau ? '0,00' : '—')}
          onChange={(e) => onChange(e.target.value)}
          onBlur={formatar}
          aria-invalid={!!erro || undefined}
          className="num w-full min-w-0 bg-transparent px-1 text-center text-lg font-semibold text-ink placeholder:font-normal placeholder:text-muted/60 focus:outline-none"
        />
        {campo.grau && (
          <button type="button" tabIndex={-1} onClick={() => passo(0.25)} className="w-8 shrink-0 text-muted hover:bg-bg hover:text-ink" aria-label={`Aumentar ${campo.label} ${olho}`}>
            <Plus className="mx-auto h-3 w-3" />
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-danger" role="alert">{erro}</p>}
    </div>
  )
}

export default function ReceitaGrid({ receita, onChange, exigeAdicao }) {
  const setCampo = (olho, key, v) => onChange({ ...receita, [olho]: { ...receita[olho], [key]: v } })
  const copiarParaOE = () => onChange({ ...receita, OE: { ...receita.OD } })

  return (
    <div className="flex flex-col gap-3">
      {/* Cabeçalho das colunas (desktop) */}
      <div className="hidden grid-cols-[108px_repeat(5,minmax(0,1fr))] gap-3 pl-6 pr-3 lg:grid">
        <span />
        {CAMPOS_RECEITA.map((c) => <span key={c.key} className="text-center text-xs font-medium text-muted">{c.label}</span>)}
      </div>

      {OLHOS.map((o) => {
        const r = receita[o.key]
        const erros = validarOlho(r)
        if (exigeAdicao && parseNum(r.adicao) === null && (parseNum(r.esferico_longe) !== null)) erros.adicao = erros.adicao || 'Multifocal exige adição'
        const perto = sugerirPerto(r)
        return (
          <div key={o.key} className={cx('relative overflow-hidden rounded-lg border border-line pl-3', o.soft)}>
            <span className={cx('absolute inset-y-0 left-0 w-1.5', o.rail)} aria-hidden />
            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-[108px_repeat(5,minmax(0,1fr))] lg:items-start">
              <div className="col-span-2 flex items-center gap-2 sm:col-span-3 lg:col-span-1 lg:h-12">
                <span className={cx('rounded px-2 py-1 text-sm font-bold', o.chip)}>{o.key}</span>
                <span className="text-sm font-medium text-ink lg:hidden xl:inline">{o.nome}</span>
              </div>
              {CAMPOS_RECEITA.map((c) => (
                <CampoGrau
                  key={c.key}
                  campo={c}
                  olho={o.key}
                  valor={r[c.key]}
                  erro={erros[c.key]}
                  onChange={(v) => setCampo(o.key, c.key, v)}
                  placeholder={c.key === 'esferico_perto' && perto !== null ? grau(perto) : undefined}
                />
              ))}
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Use as setas ou digite com vírgula. Graus em passos de 0,25. O esférico de perto é sugerido pela adição.</p>
        <button type="button" onClick={copiarParaOE} className="flex items-center gap-1 text-sm font-medium text-brand hover:underline">
          <Copy className="h-4 w-4" aria-hidden /> Copiar OD para OE
        </button>
      </div>
    </div>
  )
}
