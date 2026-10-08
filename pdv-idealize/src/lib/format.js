const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const brl = (n) => brlFmt.format(Number(n || 0))

// Aceita "−2,25", "-2.25", "+1,5", "2" → número
export function parseNum(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace('−', '-').replace(',', '.')
  if (s === '' || s === '-' || s === '+') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

// Grau com sinal e vírgula: -2.25 → "−2,25", 1.5 → "+1,50"
export function grau(n) {
  if (n === null || n === undefined || n === '') return ''
  const v = Number(n)
  if (v === 0) return '0,00'
  return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace('.', ',')
}

export const dataBR = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '')
export const dataHoraBR = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''

export const hojeISO = () => new Date().toISOString().slice(0, 10)
export function somaDias(dias, base = new Date()) {
  const d = new Date(base)
  d.setDate(d.getDate() + dias)
  return d
}
// "YYYY-MM-DDTHH:mm" para input datetime-local
export function paraDatetimeLocal(d) {
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export function somaMesesISO(iso, meses) {
  const d = new Date(iso + 'T12:00:00')
  d.setMonth(d.getMonth() + meses)
  return d.toISOString().slice(0, 10)
}

// Divide um valor em N parcelas em centavos; a última absorve o arredondamento
export function dividirParcelas(total, n) {
  const cents = Math.round(Number(total) * 100)
  const base = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cents - base * (n - 1) : base) / 100)
}

export const STATUS_OS = {
  rascunho: 'Rascunho',
  aguardando_envio: 'Aguardando envio',
  enviada_lab: 'No laboratório',
  em_producao: 'Em produção',
  em_montagem: 'Em montagem',
  pronta: 'Pronta',
  entregue_loja: 'Na loja',
  entregue_cliente: 'Entregue',
  cancelada: 'Cancelada',
}
