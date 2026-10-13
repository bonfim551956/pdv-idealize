import { cx } from '../../components/ui'

export const pct = (v, t) => (t > 0 ? `${((v / t) * 100).toFixed(0)}%` : '0%')
export const nomeLoja = (n) => (n || '').replace('Óticas Idealize ', '')

export function Kpi({ rotulo, valor, sub, cor }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4">
      <span className="text-xs font-medium text-muted">{rotulo}</span>
      <span className={cx('num truncate font-display text-xl font-bold', cor)}>{valor}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}

/* Barras horizontais: rótulo, barra proporcional e valores */
export function Barras({ itens, rotulo, valor, detalhe, cor = 'bg-brand', vazio = 'Sem dados no período.' }) {
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

