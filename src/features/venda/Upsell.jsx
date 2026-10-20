import { Sparkles, ArrowRight } from 'lucide-react'
import { brl } from '../../lib/format'
import { ROTULO_TRAT, coresDaLente } from '../../lib/lentes'
import { Modal, Button, cx } from '../../components/ui'

/*
  Técnica A ou B: antes de finalizar, o PDV monta duas propostas de melhoria a partir das lentes da venda.
  A = tratamento superior (mesma lente e resina). B = lente superior (mesma resina e tratamento).
  Sem travas nem valor mínimo: serve de roteiro para o consultor ("Posso te fazer uma proposta?").
*/
const ESCADA_TRAT = ['AR', 'BLUE INCOLOR', 'BLUE AR', 'FOTOCROMATICO INCOLOR', 'FOTOCROMATICO AR', 'TRANSITIONS INCOLOR', 'TRANSITIONS AR']
const BENEFICIO_TRAT = {
  'BLUE INCOLOR': 'filtra a luz azul das telas (celular, computador, TV)',
  'BLUE AR': 'filtra a luz azul das telas e tira os reflexos da lente',
  'FOTOCROMATICO INCOLOR': 'escurece no sol e clareia dentro de casa: um óculos para tudo',
  'FOTOCROMATICO AR': 'escurece no sol, clareia em casa e ainda tira os reflexos',
  'TRANSITIONS INCOLOR': 'Transitions original: escurece mais rápido e fica mais escura no sol',
  'TRANSITIONS AR': 'Transitions original com antirreflexo: o máximo em conforto dentro e fora de casa',
}
const at = (l) => l?.atributos || {}
const mesmaBase = (a, b, campos) => campos.every((k) => (k === 'indice' ? Number(at(a).indice) === Number(at(b).indice) : (at(a)[k] || '') === (at(b)[k] || '')))

function proximoTratamento(lentes, l) {
  const i = ESCADA_TRAT.indexOf(at(l).tratamento)
  if (i < 0) return null
  for (const t of ESCADA_TRAT.slice(i + 1)) {
    const x = lentes.find((o) => o.id !== l.id && at(o).tratamento === t && mesmaBase(o, l, ['fabricante', 'marca', 'categoria', 'linha', 'indice', 'variante']) && Number(o.preco) > Number(l.preco))
    if (x) return x
  }
  return null
}
function proximaLinha(lentes, l) {
  const cands = lentes.filter((o) => o.id !== l.id && (at(o).linha || '') !== (at(l).linha || '') && Number(o.preco) > Number(l.preco)
    && mesmaBase(o, l, ['fabricante', 'marca', 'categoria', 'indice', 'variante', 'tratamento']))
  return cands.sort((a, b) => Number(a.preco) - Number(b.preco))[0] || null
}

// Monta as propostas A e B para a lista de óculos. Cada proposta troca a lente de cada óculos que tiver upgrade.
export function montarPropostas(osList, lentes) {
  const montar = (fn) => {
    const trocas = []
    let delta = 0
    for (const os of osList) {
      for (const o of ['OD', 'OE']) {
        const atual = os.lentes[o].produto
        if (!atual) continue
        const novo = fn(lentes, atual)
        if (!novo) continue
        trocas.push({ letra: os.letra, oculos: os.oculos, olho: o, de: atual, para: novo })
        delta += Number(novo.preco) - Number(atual.preco)
      }
    }
    return trocas.length ? { trocas, delta: Math.round(delta * 100) / 100 } : null
  }
  const A = montar(proximoTratamento)
  const B = montar(proximaLinha)
  if (A) {
    const t = at(A.trocas[0].para).tratamento
    A.titulo = `Tratamento ${ROTULO_TRAT[t] || t}`
    A.texto = BENEFICIO_TRAT[t] || 'tratamento superior na mesma lente'
  }
  if (B) {
    const l = at(B.trocas[0].para).linha || ''
    B.titulo = `Lente ${String(l).replace('MULTIFOCAL ', 'Multifocal ').split(' ').map((w) => (w.length <= 2 || /\d/.test(w) ? w : w[0] + w.slice(1).toLowerCase())).join(' ')}`
    B.texto = 'lente de linha superior: mais nitidez, campo de visão mais confortável e mais durabilidade'
  }
  return { A, B }
}

// Aplica a proposta escolhida nas OS (troca as lentes; a cor é pedida de novo se a lente nova tiver cor)
export function aplicarProposta(osList, proposta) {
  return osList.map((os) => {
    const minhas = proposta.trocas.filter((t) => t.letra === os.letra && t.oculos === os.oculos)
    if (!minhas.length) return os
    const lentes = { ...os.lentes }
    for (const t of minhas) {
      const manterCor = coresDaLente(t.para).includes(lentes[t.olho].cor)
      lentes[t.olho] = { ...lentes[t.olho], produto: t.para, cor: manterCor ? lentes[t.olho].cor : '' }
    }
    return { ...os, lentes }
  })
}

const parcela = (v) => brl(Math.ceil((v / 10) * 100) / 100)

function Cartao({ letra, p, total, fator = 1, onEscolher }) {
  if (!p) return null
  // desconto em % da venda também vale sobre o acréscimo
  const acrescimo = Math.round(p.delta * fator * 100) / 100
  const novoTotal = total + acrescimo
  return (
    <button type="button" onClick={onEscolher}
      className="group flex flex-1 flex-col gap-3 rounded-lg border-2 border-line p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft">
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand font-display text-base font-bold text-surface">{letra}</span>
        <span className="font-semibold">{p.titulo}</span>
      </span>
      <span className="text-sm text-muted">{p.texto}.</span>
      <span className="flex flex-col gap-0.5">
        <span className="num text-sm text-muted">+ {brl(acrescimo)} no total</span>
        <span className="num text-lg font-bold text-ink">{brl(novoTotal)}</span>
        <span className="num text-sm font-semibold text-brand">10x de {parcela(novoTotal)} sem juros</span>
      </span>
      <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-brand">Cliente escolheu {letra} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
    </button>
  )
}

export default function UpsellModal({ aberto, propostas, total, fatorDesconto = 1, onEscolha, onFechar }) {
  const { A, B } = propostas || {}
  return (
    <Modal open={aberto} onOpenChange={(v) => !v && onFechar()} title="Antes de finalizar: proposta A ou B" wide>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-md bg-accent-soft p-3 text-sm text-accent-dark">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p><b>"Posso te fazer uma proposta?"</b> Hoje o óculos fica em <b className="num">{brl(total)}</b> ({`10x de ${parcela(total)}`}). Apresente as duas opções e deixe o cliente escolher.</p>
        </div>
        <div className={cx('flex flex-col gap-3', A && B && 'sm:flex-row')}>
          <Cartao letra="A" p={A} total={total} fator={fatorDesconto} onEscolher={() => onEscolha('A')} />
          <Cartao letra="B" p={B} total={total} fator={fatorDesconto} onEscolher={() => onEscolha('B')} />
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onEscolha('nenhuma')}>Cliente preferiu seguir como está</Button>
        </div>
      </div>
    </Modal>
  )
}
