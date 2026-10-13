// Catálogo de lentes: rótulos, ordem dos tratamentos e busca por nome/SKU (usado na OS e em Lentes e preços)
export const ORDEM_TRAT = ['AR', 'BLUE AR', 'BLUE INCOLOR', 'FOTOCROMATICO AR', 'FOTOCROMATICO INCOLOR', 'TRANSITIONS AR', 'TRANSITIONS INCOLOR']
export const ROTULO_TRAT = {
  AR: 'AR', 'BLUE AR': 'Blue AR', 'BLUE INCOLOR': 'Blue incolor', BLUE: 'Blue',
  'FOTOCROMATICO AR': 'Fotocromático AR', 'FOTOCROMATICO INCOLOR': 'Fotocromático incolor',
  'TRANSITIONS AR': 'Transitions AR', 'TRANSITIONS INCOLOR': 'Transitions incolor',
}
export const ORDEM_CAT = ['monofocal', 'multifocal', 'ocupacional', 'solar', 'controle de miopia']
export const ROTULO_CAT = { monofocal: 'Visão simples', multifocal: 'Multifocal', ocupacional: 'Ocupacional', solar: 'Solar', 'controle de miopia': 'Controle de miopia' }
export const rotuloIndice = (i) => Number(i).toFixed(2).replace('.', ',')

// Busca por nome: cada palavra digitada precisa casar com o início de alguma palavra da lente
export const normalizar = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const APELIDOS = {
  'FOTOCROMATICO AR': 'foto fotocromatica fotossensivel ar antirreflexo', 'FOTOCROMATICO INCOLOR': 'foto fotocromatica fotossensivel incolor',
  'TRANSITIONS AR': 'transitions trans ar antirreflexo', 'TRANSITIONS INCOLOR': 'transitions trans incolor',
  'BLUE AR': 'blue azul filtro ar antirreflexo', 'BLUE INCOLOR': 'blue azul filtro incolor', AR: 'ar antirreflexo',
}
export function textoBusca(l) {
  const a = l.atributos || {}
  const ind = Number(a.indice)
  return normalizar([
    l.nome, l.sku, a.linha, a.categoria, a.tratamento, APELIDOS[a.tratamento], a.marca, a.material, a.variante,
    ind.toFixed(2), ind.toFixed(2).replace('.', ''), ind.toFixed(2).replace('.', ','),
    ind === 1.59 ? 'poli policarbonato' : '', a.categoria === 'multifocal' ? 'multi progressiva' : 'mono visao simples',
  ].join(' ')).split(/[^a-z0-9.,%]+/).filter(Boolean).concat(normalizar(l.sku))
}

// Filtra lentes: cada palavra digitada precisa casar com o início de alguma palavra do nome, SKU ou apelidos
export function buscarLentes(lentes, q) {
  const termos = normalizar(q).split(/\s+/).filter(Boolean)
  if (!termos.length) return lentes
  return lentes.filter((l) => {
    const palavras = l._busca || (l._busca = textoBusca(l))
    return termos.every((t) => palavras.some((p) => p.startsWith(t)))
  })
}
