import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Plus, Trash2, ArrowLeft, Search } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { brl, parseNum } from '../lib/format'
import { validarOlho, olhoTemDados, olhoParaPayload } from '../lib/receita'
import { Button, Field, Input, Select, Switch, Section, Spinner, Alert, Textarea, cx, useToast } from '../components/ui'
import ClienteFicha, { fichaVazia } from '../features/venda/ClienteFicha'
import OSForm, { novaOS } from '../features/venda/OSForm'

const PASSOS = ['Cliente e vendedor', 'Ordens de serviço', 'Itens e confirmação']
const LETRAS = 'ABCDEFGH'

// Receita e DNP efetivas: OS sincronizadas usam as da OS A; a altura é sempre da própria OS
export function efetiva(os, osA) {
  if (!osA || os.letra === 'A' || !os.usarReceitaA) return os
  return {
    ...os,
    receita: osA.receita,
    lentes: {
      ...os.lentes,
      OD: { ...os.lentes.OD, dnp: osA.lentes.OD.dnp },
      OE: { ...os.lentes.OE, dnp: osA.lentes.OE.dnp },
    },
  }
}

function itensDaOS(os) {
  const out = []
  const { OD, OE } = os.lentes
  if (OD.produto && OE.produto && OD.produto.id === OE.produto.id) {
    out.push({ key: `${os.letra}-lente`, produto: OD.produto, olho: 'AMBOS', quantidade: 2, os: os.letra })
  } else {
    if (OD.produto) out.push({ key: `${os.letra}-lente-OD`, produto: OD.produto, olho: 'OD', quantidade: 1, os: os.letra })
    if (OE.produto) out.push({ key: `${os.letra}-lente-OE`, produto: OE.produto, olho: 'OE', quantidade: 1, os: os.letra })
  }
  if (!os.armacao.propria && os.armacao.produto) out.push({ key: `${os.letra}-armacao`, produto: os.armacao.produto, olho: null, quantidade: 1, os: os.letra })
  return out
}

function validarOS(os) {
  const e = {}
  if (!os.pacienteEhCliente && !os.paciente) e.paciente = 'Escolha o paciente'
  if (!os.previsao_entrega) e.previsao_entrega = 'Informe a data de retirada'
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
  const [observacoes, setObservacoes] = useState('')
  const [gerarOS, setGerarOS] = useState(true)
  const [osList, setOsList] = useState([novaOS('A')])
  const [osAtiva, setOsAtiva] = useState('A')
  const [descontos, setDescontos] = useState({})
  const [extras, setExtras] = useState([])
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

  const empresaId = dados?.lojas.find((l) => l.id === lojaId)?.empresa_id

  const itens = useMemo(() => {
    const doOS = gerarOS ? osList.flatMap(itensDaOS) : []
    return [...doOS, ...extras].map((it) => {
      const bruto = Number(it.produto.preco) * it.quantidade
      const desc = Math.min(Number(descontos[it.key] || 0), bruto)
      return { ...it, bruto, desconto: desc, total: bruto - desc }
    })
  }, [osList, extras, descontos, gerarOS])
  const totais = itens.reduce((a, i) => ({ bruto: a.bruto + i.bruto, desc: a.desc + i.desconto, total: a.total + i.total }), { bruto: 0, desc: 0, total: 0 })

  const resExtras = useMemo(() => {
    const b = buscaExtra.trim().toLowerCase()
    if (!dados || b.length < 2) return []
    return [...dados.outros, ...dados.armacoes].filter((p) => p.nome.toLowerCase().includes(b) || p.sku.toLowerCase().includes(b)).slice(0, 6)
  }, [buscaExtra, dados])

  const atualizarOS = (letra, os) => setOsList((l) => l.map((o) => (o.letra === letra ? os : o)))
  const adicionarOS = () => {
    const letra = LETRAS[osList.length]
    setOsList((l) => [...l, novaOS(letra)])
    setOsAtiva(letra)
  }
  const removerOS = (letra) => {
    // materializa a receita herdada antes de reordenar as letras
    const base = osList.map((o) => ({ ...efetiva(o, osList[0]), usarReceitaA: o.usarReceitaA }))
    const restante = base.filter((o) => o.letra !== letra).map((o, i) => ({ ...o, letra: LETRAS[i], usarReceitaA: i === 0 ? false : o.usarReceitaA }))
    setOsList(restante)
    setOsAtiva('A')
  }

  const avancar = async () => {
    if (passo === 0) {
      setAvancando(true)
      const c = await fichaRef.current?.salvar()
      setAvancando(false)
      if (!c) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      setCliente(c)
      setPasso(gerarOS ? 1 : 2)
    } else if (passo === 1) {
      const todos = Object.fromEntries(osList.map((o) => [o.letra, validarOS(efetiva(o, osList[0]))]))
      setErrosOS(todos)
      const comErro = osList.find((o) => Object.keys(todos[o.letra]).length)
      if (comErro) { setOsAtiva(comErro.letra); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      setPasso(2)
    }
    window.scrollTo({ top: 0 })
  }
  const voltar = () => { setPasso((p) => (p === 2 && !gerarOS ? 0 : p - 1)); window.scrollTo({ top: 0 }) }

  const confirmar = async () => {
    if (itens.length === 0) { setErroSalvar('Adicione pelo menos um item à venda.'); return }
    setSalvando(true); setErroSalvar(null)
    const descDe = (key) => itens.find((i) => i.key === key)?.desconto || 0
    const payload = {
      loja_id: lojaId,
      vendedor_id: vendedorId,
      cliente_id: cliente.id,
      tipo,
      observacoes,
      campos_extras: { meio_contato: cliente.origem },
      confirmar: true,
      os: gerarOS ? osList.map((o) => efetiva(o, osList[0])).map((os) => ({
        letra: os.letra,
        paciente_id: os.pacienteEhCliente ? null : os.paciente?.id,
        laboratorio_id: os.laboratorio_id || null,
        data_receita: os.data_receita,
        previsao_entrega: new Date(`${os.previsao_entrega}T23:59:00`).toISOString(),
        aviso_entrega: os.aviso_entrega,
        iniciais: os.iniciais,
        observacoes: os.observacoes,
        receita: Object.fromEntries(['OD', 'OE'].filter((o) => olhoTemDados(os.receita[o])).map((o) => [o, olhoParaPayload(os.receita[o])])),
        lentes: Object.fromEntries(['OD', 'OE'].filter((o) => os.lentes[o].produto).map((o) => [o, {
          produto_id: os.lentes[o].produto.id, dnp: nOuNull(os.lentes[o].dnp), altura: nOuNull(os.lentes[o].altura),
        }])),
        armacao: {
          produto_id: os.armacao.propria ? null : os.armacao.produto?.id,
          mha: nOuNull(os.armacao.mha), mva: nOuNull(os.armacao.mva), ponte: nOuNull(os.armacao.ponte), dma: nOuNull(os.armacao.dma),
          tipo: os.armacao.propria ? 'propria_cliente' : os.armacao.tipo,
          modelo_desenho: os.armacao.modelo_desenho, enviar_montagem: os.armacao.enviar_montagem, clipon: os.armacao.clipon,
        },
        itens: itensDaOS(os).map((i) => ({ produto_id: i.produto.id, olho: i.olho, quantidade: i.quantidade, desconto: descDe(i.key) })),
      })) : [],
      itens: extras.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade, desconto: descDe(i.key) })),
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
        <h1 className="text-xl font-bold">Nova venda</h1>
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
              <Section title="Cliente">
                <ClienteFicha ref={fichaRef} empresaId={empresaId} onClienteSalvo={setCliente} ficha={ficha} setFicha={setFicha} />
              </Section>
              <Section title="Venda">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-sm font-medium text-muted">Loja e consultor</span>
                    <p className="flex h-12 items-center rounded-md border border-line bg-bg px-3 text-base">
                      <span className="font-semibold">{dados.lojas[0]?.nome}</span>
                      <span className="mx-2 text-muted">·</span>
                      <span>{perfil.nome}</span>
                    </p>
                  </div>
                  <Field label="Tipo de venda">
                    {({ id }) => (
                      <Select id={id} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                        <option value="VENDA">Venda</option><option value="GARANTIA">Garantia</option>
                        <option value="CONSERTO">Conserto</option><option value="TROCA">Troca</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Observações da venda" className="sm:col-span-3">
                    {({ id }) => <Textarea id={id} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />}
                  </Field>
                  <div className="sm:col-span-3">
                    <Switch checked={gerarOS} onCheckedChange={setGerarOS} label="Gerar ordem de serviço (óculos com receita)" />
                  </div>
                </div>
              </Section>
            </div>
          )}

          {passo === 1 && (
            <Tabs.Root value={osAtiva} onValueChange={setOsAtiva} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Tabs.List className="flex flex-wrap gap-2" aria-label="Ordens de serviço">
                  {osList.map((o) => {
                    const temErro = errosOS[o.letra] && Object.keys(errosOS[o.letra]).length > 0
                    return (
                      <Tabs.Trigger key={o.letra} value={o.letra}
                        className={cx('h-10 rounded-md border px-4 text-sm font-semibold transition-colors',
                          'data-[state=active]:border-brand data-[state=active]:bg-brand data-[state=active]:text-surface',
                          'data-[state=inactive]:border-line data-[state=inactive]:bg-surface data-[state=inactive]:text-ink',
                          temErro && 'data-[state=inactive]:border-danger data-[state=inactive]:text-danger')}>
                        OS {o.letra}
                      </Tabs.Trigger>
                    )
                  })}
                </Tabs.List>
                {osList.length < LETRAS.length && <Button variant="ghost" size="sm" icon={Plus} onClick={adicionarOS}>Outra OS</Button>}
              </div>
              {osList.map((o) => (
                <Tabs.Content key={o.letra} value={o.letra} className="flex flex-col gap-4 focus:outline-none">
                  {osList.length > 1 && (
                    <div className="flex justify-end">
                      <Button variant="danger" size="sm" icon={Trash2} onClick={() => removerOS(o.letra)}>Remover OS {o.letra}</Button>
                    </div>
                  )}
                  <OSForm os={o} osA={o.letra === 'A' ? null : osList[0]} onChange={(n) => atualizarOS(o.letra, n)} cliente={cliente} empresaId={empresaId}
                    lentes={dados.lentes} armacoes={dados.armacoes} laboratorios={dados.laboratorios} erros={errosOS[o.letra]} />
                </Tabs.Content>
              ))}
            </Tabs.Root>
          )}

          {passo === 2 && (
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <Section title="Itens do pedido">
                <div className="flex flex-col gap-4">
                  {itens.length === 0 ? (
                    <p className="text-sm text-muted">Nenhum item ainda. Busque um produto abaixo.</p>
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
                                  {i.os ? `OS ${i.os}` : 'Avulso'}{i.olho ? ` · ${i.olho === 'AMBOS' ? 'Ambos os olhos' : i.olho}` : ''}
                                  {Number(i.produto.preco) === 0 && <span className="text-warn"> · sem preço cadastrado</span>}
                                </p>
                              </td>
                              <td className="py-3 pr-3 num">{i.quantidade}</td>
                              <td className="py-3 pr-3 text-right num">{brl(i.produto.preco)}</td>
                              <td className="py-3 pr-3">
                                <Input aria-label={`Desconto ${i.produto.nome}`} inputMode="decimal" className="num h-10 w-28"
                                  disabled={i.bruto === 0} value={descontos[i.key] ?? ''}
                                  onChange={(e) => {
                                    const v = parseNum(e.target.value)
                                    setDescontos((d) => ({ ...d, [i.key]: v === null || Number.isNaN(v) ? '' : Math.max(0, v) }))
                                  }} placeholder="0,00" />
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
                    <div className="flex justify-between"><dt className="text-muted">Cliente</dt><dd className="text-right font-medium">{cliente?.nome}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Vendedor</dt><dd className="font-medium">{perfil.nome}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Ordens de serviço</dt><dd className="num font-medium">{gerarOS ? osList.length : 0}</dd></div>
                    <div className="mt-2 flex justify-between border-t border-line pt-3"><dt className="text-muted">Subtotal</dt><dd className="num">{brl(totais.bruto)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Desconto</dt><dd className="num">− {brl(totais.desc)}</dd></div>
                    <div className="flex items-baseline justify-between border-t border-line pt-3"><dt className="font-semibold">Total</dt><dd className="num text-xl font-bold">{brl(totais.total)}</dd></div>
                  </dl>
                </Section>
                {totais.total === 0 && itens.length > 0 && <Alert tone="warn">Total zerado: os produtos estão sem preço cadastrado. A venda será salva, mas não terá valor a receber.</Alert>}
                {erroSalvar && <Alert>{erroSalvar}</Alert>}
                <Button size="lg" onClick={confirmar} loading={salvando} icon={Check}>Confirmar venda</Button>
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
