import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Plus, Trash2, ArrowLeft, Search, UserPlus, Link2 } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { brl, parseNum } from '../lib/format'
import { validarOlho, olhoTemDados, olhoParaPayload } from '../lib/receita'
import { Button, Field, Input, Select, Switch, Section, Spinner, Alert, Textarea, Chips, cx, useToast } from '../components/ui'
import ClienteFicha, { fichaVazia } from '../features/venda/ClienteFicha'
import OSForm, { novaOS } from '../features/venda/OSForm'
import ClientePicker from '../features/venda/ClientePicker'

const PASSOS = ['Venda e cliente', 'Ordens de serviço', 'Itens e confirmação']
const TIPOS_VENDA = [
  { value: 'VENDA', label: 'Venda', descricao: 'Venda normal, com cobrança' },
  { value: 'GARANTIA', label: 'Garantia', descricao: 'Sem cobrança e sem saldo' },
  { value: 'GARANTIA_VALOR', label: 'Garantia com valor', descricao: 'Garantia com cobrança parcial' },
  { value: 'CORTESIA', label: 'Cortesia', descricao: 'Sem cobrança e sem saldo' },
  { value: 'CONSERTO', label: 'Conserto', descricao: 'Serviço, com ou sem cobrança' },
]
const SEM_ITEM_OK = ['CONSERTO', 'GARANTIA', 'CORTESIA'] // podem ser confirmadas só com a OS
const GARANTIA_DE = [
  { value: 'oculos', label: 'Óculos completo' },
  { value: 'lente', label: 'Lente' },
  { value: 'armacao', label: 'Armação' },
]
// OS sem exigência de receita e lente: conserto e garantia só da armação
const osSimples = (tipo, garantiaDe) => tipo === 'CONSERTO' || (tipo.startsWith('GARANTIA') && garantiaDe === 'armacao')
const SEM_COBRANCA = ['GARANTIA', 'CORTESIA']
const LETRAS = 'ABCDEFGH'
const MAX_OCULOS = 6
export const chave = (o) => `${o.letra}${o.oculos}`
const rotuloOS = (o) => `OS ${o.letra} · Óculos ${o.oculos}`

// Receita e DNP efetivas: óculos 2, 3… do mesmo cliente usam as do óculos 1; a altura é sempre do próprio óculos
export function efetiva(os, lista) {
  if (os.oculos === 1 || !os.usarBase) return os
  const base = lista.find((x) => x.letra === os.letra && x.oculos === 1)
  if (!base) return os
  return {
    ...os,
    receita: base.receita,
    receita_exame_id: base.receita_exame_id,
    lentes: {
      ...os.lentes,
      OD: { ...os.lentes.OD, dnp: base.lentes.OD.dnp },
      OE: { ...os.lentes.OE, dnp: base.lentes.OE.dnp },
    },
  }
}

function itensDaOS(os) {
  const out = []
  const k = chave(os)
  const base = { os: rotuloOS(os), cliente: os.letra }
  const { OD, OE } = os.lentes
  if (OD.produto && OE.produto && OD.produto.id === OE.produto.id) {
    out.push({ ...base, key: `${k}-lente`, produto: OD.produto, olho: 'AMBOS', quantidade: 2 })
  } else {
    if (OD.produto) out.push({ ...base, key: `${k}-lente-OD`, produto: OD.produto, olho: 'OD', quantidade: 1 })
    if (OE.produto) out.push({ ...base, key: `${k}-lente-OE`, produto: OE.produto, olho: 'OE', quantidade: 1 })
  }
  if (!os.armacao.propria && os.armacao.produto) out.push({ ...base, key: `${k}-armacao`, produto: os.armacao.produto, olho: null, quantidade: 1 })
  return out
}

function validarOS(os, tipo) {
  const e = {}
  if (!os.previsao_entrega) e.previsao_entrega = 'Informe a data de retirada'
  if (tipo === 'SIMPLES') {
    // conserto e garantia de armação: receita, lente e armação são opcionais; se tiver lente, DNP e altura continuam obrigatórias
    for (const o of ['OD', 'OE']) {
      if (!os.lentes[o].produto) continue
      if (parseNum(os.lentes[o].dnp) === null) e[`dnp${o}`] = 'Obrigatória'
      if (parseNum(os.lentes[o].altura) === null) e[`altura${o}`] = 'Obrigatória'
    }
    if (Object.keys(validarOlho(os.receita.OD)).length || Object.keys(validarOlho(os.receita.OE)).length) e.receita = 'Corrija os campos destacados na receita.'
    else if (Object.keys(e).some((k) => k.startsWith('dnp') || k.startsWith('altura'))) e.receita = 'Informe DNP e altura ao lado da receita.'
    return e
  }
  const temErro = ['OD', 'OE'].some((o) => Object.keys(validarOlho(os.receita[o])).length)
  if (temErro) e.receita = 'Corrija os campos destacados na receita.'
  else if (!olhoTemDados(os.receita.OD) && !olhoTemDados(os.receita.OE)) e.receita = 'Preencha a receita de pelo menos um olho.'
  const multi = [os.lentes.OD.produto, os.lentes.OE.produto].some((p) => p?.atributos?.categoria === 'multifocal')
  if (!e.receita && multi && ['OD', 'OE'].some((o) => olhoTemDados(os.receita[o]) && parseNum(os.receita[o].adicao) === null))
    e.receita = 'Lente multifocal exige adição na receita.'
  if (!os.lentes.OD.produto && !os.lentes.OE.produto) e.lentes = 'Escolha a lente.'
  if (!os.armacao.propria && !os.armacao.produto) e.armacao = 'Escolha a armação ou marque “Armação do cliente”.'
  for (const o of ['OD', 'OE']) {
    // DNP e altura obrigatórias para todo olho com receita ou lente
    if (!os.lentes[o].produto && !olhoTemDados(os.receita[o])) continue
    const d = parseNum(os.lentes[o].dnp), a = parseNum(os.lentes[o].altura)
    if (d === null) e[`dnp${o}`] = 'Obrigatória'
    else if (Number.isNaN(d) || d < 20 || d > 45) e[`dnp${o}`] = 'Entre 20 e 45'
    if (a === null) e[`altura${o}`] = 'Obrigatória'
    else if (Number.isNaN(a) || a < 10 || a > 40) e[`altura${o}`] = 'Entre 10 e 40'
  }
  if (!e.receita && ['dnpOD', 'dnpOE', 'alturaOD', 'alturaOE'].some((k) => e[k])) e.receita = 'Informe DNP e altura ao lado da receita.'
  return e
}

const nOuNull = (v) => { const n = parseNum(v); return n === null || Number.isNaN(n) ? null : n }
const valorDe = (v) => Math.max(0, nOuNull(v) ?? 0)
const soValor = (v) => v.replace(/[^\d,.]/g, '')

export default function NovaVenda() {
  const { perfil } = useAuth()
  const nav = useNavigate()
  const toast = useToast()

  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState(null)
  const [passo, setPasso] = useState(0)
  const lojaId = perfil.loja_id
  const vendedorId = perfil.id
  const [cliente, setCliente] = useState(null)
  const fichaRef = useRef(null)
  const [ficha, setFicha] = useState(fichaVazia)
  const [avancando, setAvancando] = useState(false)
  const [tipo, setTipo] = useState('VENDA')
  const [garantiaDe, setGarantiaDe] = useState('oculos')
  const [observacoes, setObservacoes] = useState('')
  const [gerarOS, setGerarOS] = useState(true)
  const [osList, setOsList] = useState([novaOS('A', 1)])
  const [ativa, setAtiva] = useState('A1') // óculos aberto na tela (letra + número)
  const [vinculados, setVinculados] = useState({}) // clientes das OS B, C…: { B: cliente, C: cliente }
  const [errosCliente, setErrosCliente] = useState({})
  const [descontos, setDescontos] = useState({})
  const [extras, setExtras] = useState([])
  const [precos, setPrecos] = useState({}) // valor digitado para serviços (ex.: conserto)
  const [buscaExtra, setBuscaExtra] = useState('')
  const [erros, setErros] = useState({})
  const [errosOS, setErrosOS] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState(null)

  useEffect(() => {
    ;(async () => {
      const [lojas, prods, labs] = await Promise.all([
        supabase.from('lojas').select('id, nome, empresa_id').eq('id', perfil.loja_id),
        supabase.from('produtos').select('id, sku, nome, tipo, preco, atributos').eq('ativo', true).order('nome'),
        supabase.from('laboratorios').select('id, nome').eq('ativo', true).order('nome'),
      ])
      const err = lojas.error || prods.error || labs.error
      if (err) { setErroCarga(mensagemErro(err)); return }
      setDados({
        lojas: lojas.data,
        lentes: prods.data.filter((p) => p.tipo === 'lente'),
        armacoes: prods.data.filter((p) => p.tipo === 'armacao' || p.tipo === 'solar'),
        outros: prods.data.filter((p) => !['lente', 'armacao'].includes(p.tipo)),
        laboratorios: labs.data,
      })
    })()
  }, [])

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, pdvPasso: 0 }, '')
    const onPop = (e) => { if (typeof e.state?.pdvPasso === 'number') { setPasso(e.state.pdvPasso); window.scrollTo({ top: 0 }) } }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const irPara = (n) => {
    setPasso(n)
    window.history.pushState({ ...window.history.state, pdvPasso: n }, '')
    window.scrollTo({ top: 0 })
  }

  // avisa antes de fechar ou recarregar a página com a venda em andamento
  const emAndamento = !!(ficha?.nome || cliente || passo > 0)
  useEffect(() => {
    if (!emAndamento) return
    const aviso = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [emAndamento])

  const empresaId = dados?.lojas.find((l) => l.id === lojaId)?.empresa_id

  const itens = useMemo(() => {
    const doOS = gerarOS ? osList.flatMap(itensDaOS) : []
    const gratis = SEM_COBRANCA.includes(tipo)
    return [...doOS, ...extras].map((it) => {
      const unit = it.produto.tipo === 'servico' ? valorDe(precos[it.key]) : Number(it.produto.preco)
      const bruto = gratis ? 0 : unit * it.quantidade
      const desc = Math.min(valorDe(descontos[it.key]), bruto)
      return { ...it, bruto, desconto: desc, total: bruto - desc }
    })
  }, [osList, extras, descontos, gerarOS, tipo, precos])
  const totais = itens.reduce((a, i) => ({ bruto: a.bruto + i.bruto, desc: a.desc + i.desconto, total: a.total + i.total }), { bruto: 0, desc: 0, total: 0 })

  const resExtras = useMemo(() => {
    const b = buscaExtra.trim().toLowerCase()
    if (!dados || b.length < 2) return []
    return [...dados.outros, ...dados.armacoes].filter((p) => p.nome.toLowerCase().includes(b) || p.sku.toLowerCase().includes(b)).slice(0, 6)
  }, [buscaExtra, dados])

  const letras = [...new Set(osList.map((o) => o.letra))]
  const letraAtiva = ativa.charAt(0)
  const nomeCliente = (letra) => (letra === 'A' ? cliente?.nome : vinculados[letra]?.nome) || 'Cliente a definir'

  const atualizarOS = (k, os) => setOsList((l) => l.map((o) => (chave(o) === k ? os : o)))

  const adicionarCliente = () => {
    const letra = LETRAS[letras.length]
    setOsList((l) => [...l, novaOS(letra, 1)])
    setAtiva(`${letra}1`)
  }
  const removerCliente = (letra) => {
    const restantes = letras.filter((x) => x !== letra)
    const mapa = Object.fromEntries(restantes.map((x, i) => [x, LETRAS[i]]))
    setOsList((l) => l.filter((o) => o.letra !== letra).map((o) => ({ ...o, letra: mapa[o.letra] })))
    setVinculados((v) => Object.fromEntries(Object.entries(v).filter(([x]) => x !== letra && mapa[x]).map(([x, c]) => [mapa[x], c])))
    setErrosOS({}); setErrosCliente({})
    setAtiva('A1')
  }
  const adicionarOculos = (letra) => {
    const n = Math.max(...osList.filter((o) => o.letra === letra).map((o) => o.oculos)) + 1
    setOsList((l) => [...l, novaOS(letra, n)])
    setAtiva(`${letra}${n}`)
  }
  const removerOculos = (letra, n) => {
    setOsList((l) => {
      // materializa a receita herdada antes de renumerar os óculos
      const fixos = l.map((o) => (o.letra === letra ? { ...efetiva(o, l), usarBase: o.usarBase } : o))
      let i = 0
      return fixos.filter((o) => !(o.letra === letra && o.oculos === n)).map((o) => {
        if (o.letra !== letra) return o
        i += 1
        return { ...o, oculos: i, usarBase: i === 1 ? false : o.usarBase }
      })
    })
    setErrosOS({})
    setAtiva(`${letra}1`)
  }

  const avancar = async () => {
    if (passo === 0) {
      setAvancando(true)
      const c = await fichaRef.current?.salvar()
      setAvancando(false)
      if (!c) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      setCliente(c)
      irPara(gerarOS ? 1 : 2)
      return
    } else if (passo === 1) {
      const ec = Object.fromEntries(letras.filter((l) => l !== 'A' && !vinculados[l]).map((l) => [l, 'Escolha ou cadastre o cliente desta OS']))
      setErrosCliente(ec)
      const todos = Object.fromEntries(osList.map((o) => [chave(o), validarOS(efetiva(o, osList), osSimples(tipo, garantiaDe) ? 'SIMPLES' : tipo)]))
      setErrosOS(todos)
      const semCliente = letras.find((l) => ec[l])
      const comErro = osList.find((o) => Object.keys(todos[chave(o)]).length)
      if (semCliente) { setAtiva(`${semCliente}1`); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      if (comErro) { setAtiva(chave(comErro)); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      irPara(2)
    }
  }
  // volta uma etapa mantendo tudo o que já foi preenchido
  const voltar = () => window.history.back()

  const confirmar = async () => {
    if (itens.length === 0 && !(gerarOS && SEM_ITEM_OK.includes(tipo))) { setErroSalvar('Adicione pelo menos um item à venda.'); return }
    setSalvando(true); setErroSalvar(null)
    const descDe = (key) => itens.find((i) => i.key === key)?.desconto || 0
    const payload = {
      loja_id: lojaId,
      vendedor_id: vendedorId,
      cliente_id: cliente.id,
      tipo,
      observacoes,
      campos_extras: { meio_contato: cliente.origem, ...(tipo.startsWith('GARANTIA') ? { garantia_de: garantiaDe } : {}) },
      confirmar: true,
      os: gerarOS ? osList.map((o) => efetiva(o, osList)).map((os) => ({
        letra: os.letra,
        oculos: os.oculos,
        paciente_id: os.letra === 'A' ? null : vinculados[os.letra]?.id,
        laboratorio_id: os.laboratorio_id || null,
        data_receita: os.data_receita,
        previsao_entrega: new Date(`${os.previsao_entrega}T23:59:00`).toISOString(),
        aviso_entrega: os.aviso_entrega,
        iniciais: os.iniciais,
        observacoes: os.observacoes,
        receita_exame_id: os.receita_exame_id || null,
        receita: Object.fromEntries(['OD', 'OE'].filter((o) => olhoTemDados(os.receita[o])).map((o) => [o, olhoParaPayload(os.receita[o])])),
        lentes: Object.fromEntries(['OD', 'OE'].filter((o) => os.lentes[o].produto).map((o) => [o, {
          produto_id: os.lentes[o].produto.id, dnp: nOuNull(os.lentes[o].dnp), altura: nOuNull(os.lentes[o].altura),
        }])),
        armacao: {
          produto_id: os.armacao.propria ? null : os.armacao.produto?.id,
          mha: nOuNull(os.armacao.mha), mva: nOuNull(os.armacao.mva), ponte: nOuNull(os.armacao.ponte), dma: nOuNull(os.armacao.dma),
          tipo: os.armacao.tipo || 'nenhum',
          modelo_desenho: os.armacao.modelo_desenho, enviar_montagem: os.armacao.enviar_montagem, clipon: os.armacao.clipon,
        },
        itens: itensDaOS(os).map((i) => ({ produto_id: i.produto.id, olho: i.olho, quantidade: i.quantidade, desconto: descDe(i.key) })),
      })) : [],
      itens: extras.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade, desconto: descDe(i.key), preco: i.produto.tipo === 'servico' ? valorDe(precos[i.key]) : undefined })),
    }
    const { data, error } = await supabase.rpc('criar_venda', { p: payload })
    setSalvando(false)
    if (error) { setErroSalvar(mensagemErro(error)); return }
    toast(`Venda nº ${data.numero} confirmada`)
    nav(`/vendas/${data.id}`)
  }

  if (erroCarga) return <div className="mx-auto max-w-3xl"><Alert>{erroCarga}</Alert></div>
  if (!dados) return <Spinner label="Carregando produtos" />

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-bold">Nova OS</h1>
        <p className="num text-lg font-semibold">{brl(totais.total)}</p>
      </div>

      {/* Etapas */}
      <ol className="grid grid-cols-3 gap-2" aria-label="Etapas da venda">
        {PASSOS.map((p, i) => {
          const pulado = i === 1 && !gerarOS
          const feito = i < passo && !pulado
          return (
            <li key={p} className={cx('flex flex-col gap-2', pulado && 'opacity-40')} aria-current={i === passo ? 'step' : undefined}>
              <span className={cx('h-1 rounded-full', i <= passo && !pulado ? 'bg-brand' : 'bg-line')} />
              <span className={cx('flex items-center gap-2 text-sm', i === passo ? 'font-semibold text-ink' : 'text-muted')}>
                {feito ? <Check className="h-4 w-4 text-brand" aria-hidden /> : <span className="num">{i + 1}.</span>}
                <span className="hidden sm:inline">{p}</span>
              </span>
            </li>
          )
        })}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={passo} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
          {passo === 0 && (
            <div className="flex flex-col gap-6">
              <Section title="Venda">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-muted">Tipo de venda <span className="text-danger">*</span></span>
                    <div role="radiogroup" aria-label="Tipo de venda" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {TIPOS_VENDA.map((t) => (
                        <button key={t.value} type="button" role="radio" aria-checked={tipo === t.value} onClick={() => setTipo(t.value)}
                          className={cx('flex flex-col items-start gap-1 rounded-md border px-4 py-3 text-left transition-colors',
                            tipo === t.value ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand')}>
                          <span className={cx('font-display font-bold', tipo === t.value ? 'text-brand' : 'text-ink')}>{t.label}</span>
                          <span className="text-xs text-muted">{t.descricao}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {tipo.startsWith('GARANTIA') && (
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-muted">O que está na garantia? <span className="text-danger">*</span></span>
                      <Chips label="Garantia de" value={garantiaDe} onChange={(v) => v && setGarantiaDe(v)} options={GARANTIA_DE} />
                      {garantiaDe === 'armacao' && <p className="text-xs text-muted">Garantia de armação: receita e lente não são obrigatórias.</p>}
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-muted">Loja e consultor</span>
                      <p className="flex h-12 items-center rounded-md border border-line bg-bg px-3 text-base">
                        <span className="font-semibold">{dados.lojas[0]?.nome}</span>
                        <span className="mx-2 text-muted">·</span>
                        <span>{perfil.nome}</span>
                      </p>
                    </div>
                    <div className="flex items-end pb-3">
                      <Switch checked={gerarOS} onCheckedChange={setGerarOS} label="Gerar ordem de serviço (óculos com receita)" />
                    </div>
                  </div>
                </div>
              </Section>
              <Section title="Cliente">
                <ClienteFicha ref={fichaRef} empresaId={empresaId} onClienteSalvo={setCliente} ficha={ficha} setFicha={setFicha} />
              </Section>
              <Section title="Observações da venda">
                <Textarea aria-label="Observações da venda" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional" />
              </Section>
            </div>
          )}

          {passo === 1 && (
            <div className="flex flex-col gap-4">
              {/* OS = cliente. A é quem trouxe o lead; B, C… vieram junto e ficam vinculados a ele */}
              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Clientes da venda">
                {letras.map((l) => {
                  const temErro = errosCliente[l] || osList.some((o) => o.letra === l && errosOS[chave(o)] && Object.keys(errosOS[chave(o)]).length)
                  const ativo = l === letraAtiva
                  return (
                    <button key={l} type="button" role="tab" aria-selected={ativo} onClick={() => setAtiva(`${l}1`)}
                      className={cx('flex h-12 items-center gap-2 rounded-md border px-4 text-left text-sm transition-colors',
                        ativo ? 'border-brand bg-brand text-surface' : temErro ? 'border-danger bg-surface text-danger' : 'border-line bg-surface text-ink hover:border-brand')}>
                      <span className="font-display font-bold">OS {l}</span>
                      <span className={cx('max-w-[160px] truncate', ativo ? 'text-surface/90' : 'text-muted')}>{nomeCliente(l).split(' ')[0]}</span>
                      {l === 'A' && <span className={cx('rounded px-1.5 text-xs font-semibold', ativo ? 'bg-surface/20' : 'bg-accent-soft text-accent-dark')}>principal</span>}
                    </button>
                  )
                })}
                {letras.length < LETRAS.length && <Button variant="ghost" size="sm" icon={UserPlus} onClick={adicionarCliente}>Adicionar cliente</Button>}
              </div>

              <Section title={`OS ${letraAtiva} · ${nomeCliente(letraAtiva)}`} aside={letraAtiva !== 'A' && (
                <Button variant="danger" size="sm" icon={Trash2} onClick={() => removerCliente(letraAtiva)}>Remover OS {letraAtiva}</Button>
              )}>
                {letraAtiva === 'A' ? (
                  <p className="text-sm text-muted">Cliente principal da venda, que veio pelo contato de <b className="text-ink">{cliente?.origem || '—'}</b>. O WhatsApp dele identifica o lead para cruzar com as campanhas.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="flex items-center gap-2 text-sm text-muted"><Link2 className="h-4 w-4" aria-hidden /> Fica vinculado a <b className="text-ink">{cliente?.nome}</b> e herda o meio de contato. O WhatsApp dele serve só para avisos.</p>
                    <ClientePicker label="Cliente desta OS" value={vinculados[letraAtiva] || null} empresaId={empresaId} principal={cliente}
                      excluir={[cliente?.id, ...Object.entries(vinculados).filter(([l]) => l !== letraAtiva).map(([, c]) => c?.id)].filter(Boolean)}
                      error={errosCliente[letraAtiva]}
                      onChange={(c) => { setVinculados((v) => ({ ...v, [letraAtiva]: c })); setErrosCliente((e) => ({ ...e, [letraAtiva]: undefined })) }} />
                  </div>
                )}
              </Section>

              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Óculos deste cliente">
                {osList.filter((o) => o.letra === letraAtiva).map((o) => {
                  const k = chave(o)
                  const temErro = errosOS[k] && Object.keys(errosOS[k]).length > 0
                  return (
                    <button key={k} type="button" role="tab" aria-selected={ativa === k} onClick={() => setAtiva(k)}
                      className={cx('h-10 rounded-md border px-4 text-sm font-semibold transition-colors',
                        ativa === k ? 'border-brand bg-brand-soft text-brand' : temErro ? 'border-danger text-danger' : 'border-line bg-surface text-ink hover:border-brand')}>
                      Óculos {o.oculos}
                    </button>
                  )
                })}
                {osList.filter((o) => o.letra === letraAtiva).length < MAX_OCULOS && (
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => adicionarOculos(letraAtiva)}>Outro óculos</Button>
                )}
              </div>

              {osList.filter((o) => chave(o) === ativa).map((o) => (
                <div key={chave(o)} className="flex flex-col gap-4">
                  {o.oculos > 1 && (
                    <div className="flex justify-end">
                      <Button variant="danger" size="sm" icon={Trash2} onClick={() => removerOculos(o.letra, o.oculos)}>Remover óculos {o.oculos}</Button>
                    </div>
                  )}
                  <OSForm os={o} base={o.oculos > 1 ? osList.find((x) => x.letra === o.letra && x.oculos === 1) : null}
                    onChange={(n) => atualizarOS(chave(o), n)}
                    lentes={dados.lentes} armacoes={dados.armacoes} laboratorios={dados.laboratorios} erros={errosOS[chave(o)]}
                    paciente={o.letra === 'A' ? cliente : vinculados[o.letra]} />
                </div>
              ))}
            </div>
          )}

          {passo === 2 && (
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <Section title="Itens do pedido">
                <div className="flex flex-col gap-4">
                  {itens.length === 0 ? (
                    <p className="text-sm text-muted">{gerarOS && SEM_ITEM_OK.includes(tipo) ? 'Sem itens: a OS pode ser confirmada assim. Se houver cobrança, adicione o serviço abaixo.' : 'Nenhum item ainda. Busque um produto abaixo.'}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="border-b border-line text-muted">
                          <tr>
                            <th className="py-2 pr-3 font-medium">Produto</th>
                            <th className="py-2 pr-3 font-medium">Qtd</th>
                            <th className="py-2 pr-3 text-right font-medium">Unitário</th>
                            <th className="py-2 pr-3 font-medium">Desconto (R$)</th>
                            <th className="py-2 text-right font-medium">Total</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map((i) => (
                            <tr key={i.key} className="border-b border-line last:border-0">
                              <td className="py-3 pr-3">
                                <p className="font-medium">{i.produto.nome}</p>
                                <p className="text-xs text-muted">
                                  {i.os || 'Avulso'}{i.olho ? ` · ${i.olho === 'AMBOS' ? 'Ambos os olhos' : i.olho}` : ''}
                                  {Number(i.produto.preco) === 0 && i.produto.tipo !== 'servico' && <span className="text-warn"> · sem preço cadastrado</span>}
                                </p>
                              </td>
                              <td className="py-3 pr-3 num">{i.quantidade}</td>
                              <td className="py-3 pr-3 text-right num">
                                {i.produto.tipo === 'servico' && !SEM_COBRANCA.includes(tipo) ? (
                                  <Input aria-label={`Valor ${i.produto.nome}`} inputMode="decimal" className="num h-10 w-28 text-right" placeholder="0,00"
                                    value={precos[i.key] ?? ''} onChange={(e) => setPrecos((p) => ({ ...p, [i.key]: soValor(e.target.value) }))} />
                                ) : brl(i.bruto / i.quantidade)}
                              </td>
                              <td className="py-3 pr-3">
                                <Input aria-label={`Desconto ${i.produto.nome}`} inputMode="decimal" className="num h-10 w-28"
                                  disabled={i.bruto === 0} value={descontos[i.key] ?? ''}
                                  onChange={(e) => setDescontos((d) => ({ ...d, [i.key]: soValor(e.target.value) }))} placeholder="0,00" />
                              </td>
                              <td className="py-3 text-right num font-semibold">{brl(i.total)}</td>
                              <td className="py-3 pl-2">
                                {!i.os && (
                                  <button type="button" onClick={() => setExtras((x) => x.filter((e) => e.key !== i.key))} className="rounded p-1 text-muted hover:text-danger" aria-label={`Remover ${i.produto.nome}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {tipo === 'CONSERTO' && !extras.some((x) => x.produto.sku === 'SERV-CONSERTO') && dados.outros.find((p) => p.sku === 'SERV-CONSERTO') && (
                    <Button variant="secondary" size="sm" icon={Plus} className="self-start" onClick={() => {
                      const p = dados.outros.find((x) => x.sku === 'SERV-CONSERTO')
                      setExtras((x) => [...x, { key: `extra-${p.id}-${Date.now()}`, produto: p, quantidade: 1, olho: null }])
                    }}>Adicionar valor do conserto</Button>
                  )}
                  <div className="flex flex-col gap-1">
                    <div className="relative max-w-md">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                      <Input aria-label="Adicionar produto avulso" className="pl-9" placeholder="Adicionar produto avulso (estojo, spray, solar…)" value={buscaExtra} onChange={(e) => setBuscaExtra(e.target.value)} />
                    </div>
                    {buscaExtra.trim().length >= 2 && (
                      <ul className="max-w-md overflow-hidden rounded-md border border-line bg-surface">
                        {resExtras.map((p) => (
                          <li key={p.id}>
                            <button type="button" className="flex w-full justify-between px-4 py-3 text-left hover:bg-brand-soft"
                              onClick={() => { setExtras((x) => [...x, { key: `extra-${p.id}-${Date.now()}`, produto: p, quantidade: 1, olho: null }]); setBuscaExtra('') }}>
                              <span className="font-medium">{p.nome}</span><span className="num text-sm text-muted">{brl(p.preco)}</span>
                            </button>
                          </li>
                        ))}
                        {resExtras.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nenhum produto encontrado.</li>}
                      </ul>
                    )}
                  </div>
                </div>
              </Section>

              <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
                <Section title="Resumo">
                  <dl className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between"><dt className="text-muted">Tipo</dt><dd className="font-medium">{TIPOS_VENDA.find((t) => t.value === tipo)?.label}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Cliente</dt><dd className="text-right font-medium">{cliente?.nome}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Vendedor</dt><dd className="font-medium">{perfil.nome}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Clientes / óculos</dt><dd className="num font-medium">{gerarOS ? `${letras.length} / ${osList.length}` : '—'}</dd></div>
                    {letras.length > 1 && gerarOS && (
                      <div className="mt-2 flex flex-col gap-1 border-t border-line pt-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Por cliente</dt>
                        {letras.map((l) => (
                          <div key={l} className="flex justify-between gap-2">
                            <dd className="truncate">OS {l} · {nomeCliente(l).split(' ')[0]}</dd>
                            <dd className="num">{brl(itens.filter((i) => i.cliente === l).reduce((t, i) => t + i.total, 0))}</dd>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex justify-between border-t border-line pt-3"><dt className="text-muted">Subtotal</dt><dd className="num">{brl(totais.bruto)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Desconto</dt><dd className="num">− {brl(totais.desc)}</dd></div>
                    <div className="flex items-baseline justify-between border-t border-line pt-3"><dt className="font-semibold">Total</dt><dd className="num text-xl font-bold">{brl(totais.total)}</dd></div>
                  </dl>
                </Section>
                {SEM_COBRANCA.includes(tipo) ? (
                  <Alert tone="ok">{TIPOS_VENDA.find((t) => t.value === tipo)?.label}: os itens entram sem cobrança e a venda não gera saldo a receber.</Alert>
                ) : totais.total === 0 && itens.length > 0 && <Alert tone="warn">Total zerado: os produtos estão sem preço cadastrado. A venda será salva, mas não terá valor a receber.</Alert>}
                {erroSalvar && <Alert>{erroSalvar}</Alert>}
                <Button size="lg" onClick={confirmar} loading={salvando} icon={Check}>{gerarOS ? 'Confirmar OS' : 'Confirmar venda'}</Button>
                <p className="text-xs text-muted">Ao confirmar, as OS entram na fila do laboratório e você segue para o recebimento.</p>
              </aside>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between border-t border-line pt-4">
        {passo > 0 ? <Button variant="secondary" icon={ArrowLeft} onClick={voltar}>Voltar</Button> : <span />}
        {passo < 2 && <Button onClick={avancar} loading={avancando}>{passo === 0 ? 'Salvar cliente e continuar' : 'Continuar'}</Button>}
      </div>
    </div>
  )
}
