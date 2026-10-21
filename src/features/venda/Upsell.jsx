import { Sparkles, ArrowRight, Ban } from 'lucide-react'
import { brl } from '../../lib/format'
import { ROTULO_TRAT, coresDaLente, rotuloIndice } from '../../lib/lentes'
import { Modal, Button } from '../../components/ui'

/*
  Técnica A ou B: antes de finalizar, o PDV monta duas propostas de melhoria a partir das lentes da venda.
  A = tratamento superior (mesma lente, resina e filtro).
  B = lente superior (linha acima; se não houver, a mesma lente numa resina mais fina).
  O consultor é obrigado a passar por esta tela: escolhe A, B ou registra que o cliente seguiu como está.
  Regra de preço para todas as marcas: a proposta é sempre o próximo degrau acima (o mais barato entre os superiores).
*/
const BENEFICIO_TRAT = {
  'BLUE INCOLOR': 'filtra a luz azul das telas (celular, computador, TV)',
  'BLUE AR': 'filtra a luz azul das telas e tira os reflexos da lente',
  'FOTOCROMATICO INCOLOR': 'escurece no sol e clareia dentro de casa: um óculos para tudo',
  'FOTOCROMATICO AR': 'escurece no sol, clareia em casa e ainda tira os reflexos',
  'TRANSITIONS INCOLOR': 'Transitions original: escurece mais rápido e fica mais escura no sol',
  'TRANSITIONS AR': 'Transitions original com antirreflexo: o máximo em conforto dentro e fora de casa',
  'Crizal Easy Pro': 'antirreflexo que limpa fácil e resiste a riscos',
  'Crizal Rock': 'antirreflexo mais resistente a riscos do mercado Essilor',
  'Crizal Prevencia': 'antirreflexo com filtro da luz azul nociva das telas',
  'Crizal Sapphire HR': 'antirreflexo premium: quase invisível, sem reflexo de nenhum ângulo',
  'Crizal Natural Look': 'antirreflexo premium com visual mais natural da lente',
  Optifog: 'antiembaçante: não embaça com máscara, cozinha ou mudança de temperatura',
  'No Reflex': 'antirreflexo: tira os reflexos e melhora a visão à noite',
  'DuraVision Silver UV': 'antirreflexo ZEISS resistente, fácil de limpar, com proteção UV',
  'DuraVision Platinum UV': 'antirreflexo ZEISS premium: máxima nitidez e resistência a riscos',
  'DuraVision Gold UV': 'antirreflexo ZEISS top de linha: o mais resistente e fácil de limpar',
  'DuraVision DriveSafe': 'antirreflexo para dirigir: menos ofuscamento dos faróis à noite',
}
const SEM_TRAT = ['Sem AR', 'Sem tratamento']
const at = (l) => l?.atributos || {}
const igual = (a, b, k) => (k === 'indice' ? Number(at(a).indice) === Number(at(b).indice) : (at(a)[k] || '') === (at(b)[k] || ''))
const iguais = (a, b, campos) => campos.every((k) => igual(a, b, k))
const maisBarato = (lista) => lista.sort((a, b) => Number(a.preco) - Number(b.preco))[0] || null
const acima = (lentes, l) => lentes.filter((o) => o.id !== l.id && Number(o.preco) > Number(l.preco))

// A: mesmo produto, tratamento superior
function tratamentoSuperior(lentes, l) {
  return maisBarato(acima(lentes, l).filter((o) => !igual(o, l, 'tratamento') && !SEM_TRAT.includes(at(o).tratamento)
    && iguais(o, l, ['fabricante', 'marca', 'categoria', 'linha', 'indice', 'variante'])))
}
// Resina mais fina: mesma lente e tratamento, índice maior
function resinaMaisFina(lentes, l) {
  return maisBarato(acima(lentes, l).filter((o) => Number(at(o).indice) > Number(at(l).indice)
    && iguais(o, l, ['fabricante', 'marca', 'categoria', 'linha', 'tratamento', 'variante'])))
}
// B: linha superior. Do mais parecido ao mais aberto, sempre o próximo degrau de preço
function linhaSuperior(lentes, l) {
  const outras = acima(lentes, l).filter((o) => !igual(o, l, 'linha') && igual(o, l, 'categoria'))
  const niveis = [
    ['marca', 'indice', 'tratamento', 'variante'],
    ['marca', 'tratamento', 'variante'],
    ['marca', 'indice', 'tratamento'],
    ['fabricante', 'tratamento', 'variante'],
    ['fabricante', 'variante'],
    ['variante'],
    [],
  ]
  for (const campos of niveis) {
    const x = maisBarato(outras.filter((o) => iguais(o, l, campos)))
    if (x) return x
  }
  return null
}

function descrever(p) {
  const t = p.trocas[0]
  const de = at(t.de), para = at(t.para)
  if (p.tipo === 'tratamento') {
    const nome = ROTULO_TRAT[para.tratamento] || para.tratamento
    return { titulo: `Tratamento ${nome}`, texto: BENEFICIO_TRAT[para.tratamento] || 'tratamento superior na mesma lente: mais proteção e conforto' }
  }
  if (p.tipo === 'resina') {
    return { titulo: `Lente mais fina (${rotuloIndice(para.indice)})`, texto: `mesma lente em resina ${rotuloIndice(para.indice)}: mais fina, mais leve e mais bonita no rosto` }
  }
  const mudouTrat = (de.tratamento || '') !== (para.tratamento || '')
  return {
    titulo: `Lente ${para.linha || 'superior'}`,
    texto: `lente de linha superior: mais nitidez e campo de visão mais confortável${mudouTrat ? ` (com ${ROTULO_TRAT[para.tratamento] || para.tratamento})` : ''}`,
  }
}

// Monta as propostas A e B para a lista de óculos. Cada proposta troca a lente de cada óculos que tiver upgrade.
export function montarPropostas(osList, lentes) {
  const montar = (fns, evitar) => {
    const trocas = []
    let delta = 0
    let tipo = null
    for (const os of osList) {
      for (const o of ['OD', 'OE']) {
        const atual = os.lentes[o].produto
        if (!atual) continue
        let novo = null
        for (const [t, fn] of fns) {
          const x = fn(lentes, atual)
          if (x && !(evitar && evitar(os, o, x))) { novo = x; tipo = tipo || t; break }
        }
        if (!novo) continue
        trocas.push({ letra: os.letra, oculos: os.oculos, olho: o, de: atual, para: novo })
        delta += Number(novo.preco) - Number(atual.preco)
      }
    }
    if (!trocas.length) return null
    const p = { tipo, trocas, delta: Math.round(delta * 100) / 100 }
    return { ...p, ...descrever(p) }
  }
  const A = montar([['tratamento', tratamentoSuperior], ['resina', resinaMaisFina]])
  // B nunca repete a lente que a A já propôs para o mesmo olho
  const daA = (os, o, x) => A?.trocas.some((t) => t.letra === os.letra && t.oculos === os.oculos && t.olho === o && t.para.id === x.id)
  const B = montar([['linha', linhaSuperior], ['resina', resinaMaisFina]], daA)
  return { A, B }
}

// Aplica a proposta escolhida nas OS (troca as lentes; a cor é pedida de novo se a lente nova não tiver a mesma cor)
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

function Cartao({ letra, rotulo, p, total, fator = 1, onEscolher }) {
  if (!p) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-line p-4 text-muted">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-line font-display text-base font-bold text-muted">{letra}</span>
          <span className="font-semibold">{rotulo}</span>
        </span>
        <span className="flex items-start gap-2 text-sm"><Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Esta lente já é a de nível mais alto nesta opção.</span>
      </div>
    )
  }
  const tipoTxt = { tratamento: 'tratamento', linha: 'lente', resina: 'lente mais fina' }[p.tipo] || ''
  // desconto em % da venda também vale sobre o acréscimo
  const acrescimo = Math.round(p.delta * fator * 100) / 100
  const novoTotal = total + acrescimo
  return (
    <button type="button" onClick={onEscolher}
      className="group flex flex-col gap-3 rounded-lg border-2 border-line p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft focus-visible:border-brand">
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-display text-base font-bold text-surface">{letra}</span>
        <span className="flex flex-col leading-tight">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Opção {letra} · {tipoTxt}</span>
          <span className="font-semibold">{p.titulo}</span>
        </span>
      </span>
      <span className="text-sm text-muted">{p.texto[0].toUpperCase() + p.texto.slice(1)}.</span>
      <span className="flex flex-col gap-0.5">
        <span className="num text-sm text-muted">+ {brl(acrescimo)} no total</span>
        <span className="num text-xl font-bold text-ink">{brl(novoTotal)}</span>
        <span className="num text-sm font-semibold text-brand">10x de {parcela(novoTotal)} sem juros</span>
      </span>
      <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-brand">Cliente escolheu {letra} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
    </button>
  )
}

export default function UpsellModal({ aberto, propostas, total, fatorDesconto = 1, onEscolha }) {
  const { A, B } = propostas || {}
  return (
    <Modal open={aberto} onOpenChange={() => {}} travado title="Antes de finalizar: proposta A ou B" wide>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-md bg-accent-soft p-3 text-sm text-accent-dark">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p><b>"Posso te fazer uma proposta?"</b> Hoje o óculos fica em <b className="num">{brl(total)}</b> ({`10x de ${parcela(total)}`}). Apresente as duas opções e deixe o cliente escolher.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Cartao letra="A" rotulo="Opção A · tratamento" p={A} total={total} fator={fatorDesconto} onEscolher={() => onEscolha('A')} />
          <Cartao letra="B" rotulo="Opção B · lente" p={B} total={total} fator={fatorDesconto} onEscolher={() => onEscolha('B')} />
        </div>
        <div className="flex justify-end border-t border-line pt-4">
          <Button variant="secondary" onClick={() => onEscolha('nenhuma')}>Cliente recusou A e B: seguir como está</Button>
        </div>
      </div>
    </Modal>
  )
}
