import { parseNum } from './format'

export const CAMPOS_RECEITA = [
  { key: 'esferico_longe', label: 'Esf. longe', grau: true, min: -30, max: 30 },
  { key: 'cilindrico', label: 'Cilíndrico', grau: true, min: -10, max: 10 },
  { key: 'eixo', label: 'Eixo', grau: false, min: 0, max: 180, inteiro: true },
  { key: 'adicao', label: 'Adição', grau: true, min: 0.5, max: 4 },
  { key: 'esferico_perto', label: 'Esf. perto', grau: true, min: -30, max: 30 },
]

export const olhoVazio = () => ({ esferico_longe: '', cilindrico: '', eixo: '', adicao: '', esferico_perto: '' })

// Mesmas regras do banco: passo 0,25, faixas, cilíndrico exige eixo
export function validarOlho(r) {
  const erros = {}
  for (const c of CAMPOS_RECEITA) {
    const v = parseNum(r[c.key])
    if (v === null) continue
    if (Number.isNaN(v)) { erros[c.key] = 'Número inválido'; continue }
    if (v < c.min || v > c.max) erros[c.key] = `Entre ${c.min} e ${c.max}`
    else if (c.grau && Math.round(v * 100) % 25 !== 0) erros[c.key] = 'Use passos de 0,25'
    else if (c.inteiro && !Number.isInteger(v)) erros[c.key] = 'Sem casas decimais'
  }
  const cil = parseNum(r.cilindrico)
  if (cil && !Number.isNaN(cil) && cil !== 0 && parseNum(r.eixo) === null) erros.eixo = 'Informe o eixo'
  return erros
}

export function olhoTemDados(r) {
  return CAMPOS_RECEITA.some((c) => parseNum(r[c.key]) !== null)
}

// Esférico de perto sugerido = longe + adição
export function sugerirPerto(r) {
  const l = parseNum(r.esferico_longe)
  const a = parseNum(r.adicao)
  if (l === null || a === null || Number.isNaN(l) || Number.isNaN(a)) return null
  return Math.round((l + a) * 100) / 100
}

export function olhoParaPayload(r) {
  const out = {}
  for (const c of CAMPOS_RECEITA) {
    const v = parseNum(r[c.key])
    out[c.key] = v === null || Number.isNaN(v) ? null : v
  }
  return out
}
