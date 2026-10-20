const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const brl = (n) => brlFmt.format(Number(n || 0))

// Valor em reais digitado no balcão: "1.250,00", "1250,5", "1.250" (milhar) e "12.5" (ponto decimal)
export function parseValor(v) {
  if (v === null || v === undefined) return null
  let s = String(v).trim().replace(/\s|R\$/g, '')
  if (s === '') return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

// Aceita "−2,25", "-2.25", "+1,5", "2" → número (graus, medidas)
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

// Data de hoje no fuso da loja (não em UTC: depois das 21h o UTC já é o dia seguinte)
export const isoLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const hojeISO = () => isoLocal()
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
// Soma meses mantendo o dia; se o mês não tiver esse dia (31/01 + 1 mês), usa o último dia do mês
export function somaMesesISO(iso, meses) {
  const [a, m, dia] = iso.split('-').map(Number)
  const alvo = new Date(a, m - 1 + meses, 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(dia, ultimo))
  return isoLocal(alvo)
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
