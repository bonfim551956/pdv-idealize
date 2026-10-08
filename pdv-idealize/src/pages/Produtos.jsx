import { useEffect, useMemo, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Plus, Search } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { brl, parseNum } from '../lib/format'
import { Button, Field, Input, Select, Chips, Section, Spinner, Alert, Modal, Switch, cx, useToast } from '../components/ui'

const TIPOS = { armacao: 'Armação', solar: 'Óculos solar', acessorio: 'Acessório', servico: 'Serviço', tratamento: 'Tratamento', lente_contato: 'Lente de contato' }
const brlInput = (n) => (Number(n) ? Number(n).toFixed(2).replace('.', ',') : '')

function PrecoCell({ produto, campo, onSalvo }) {
  const toast = useToast()
  const [v, setV] = useState(brlInput(produto[campo]))
  const [estado, setEstado] = useState('idle') // idle | salvando | ok | erro
  useEffect(() => setV(brlInput(produto[campo])), [produto, campo])

  const salvar = async () => {
    const n = parseNum(v) ?? 0
    if (Number.isNaN(n) || n < 0) { setEstado('erro'); return }
    if (n === Number(produto[campo] || 0)) return
    setEstado('salvando')
    const { error } = await supabase.from('produtos').update({ [campo]: n }).eq('id', produto.id)
    if (error) { setEstado('erro'); toast(mensagemErro(error), 'erro'); return }
    setEstado('ok'); onSalvo(produto.id, { [campo]: n })
    setTimeout(() => setEstado('idle'), 1200)
  }
  return (
    <Input aria-label={`${campo === 'preco' ? 'Preço' : 'Custo'} ${produto.nome}`} inputMode="decimal" placeholder="0,00"
      className={cx('num h-10 w-28 text-right', estado === 'ok' && 'border-ok', estado === 'erro' && 'border-danger', estado === 'salvando' && 'opacity-60')}
      value={v} onChange={(e) => setV(e.target.value.replace(/[^\d,.]/g, ''))} onBlur={salvar}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  )
}

function NovoProdutoModal({ open, onOpenChange, onCriado }) {
  const toast = useToast()
  const [f, setF] = useState({ sku: '', nome: '', tipo: 'armacao', marca: '', preco: '', custo: '' })
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const salvar = async (e) => {
    e.preventDefault()
    if (!f.sku.trim() || !f.nome.trim()) { setErro('Informe SKU e nome.'); return }
    const preco = parseNum(f.preco) ?? 0
    setSalvando(true); setErro(null)
    const { data, error } = await supabase.from('produtos').insert({
      sku: f.sku.trim().toUpperCase(), nome: f.nome.trim().toUpperCase(), tipo: f.tipo, marca: f.marca || null,
      preco, custo: parseNum(f.custo), ativo: true,
    }).select('*').single()
    setSalvando(false)
    if (error) { setErro(mensagemErro(error)); return }
    toast('Produto cadastrado'); onCriado(data); onOpenChange(false)
    setF({ sku: '', nome: '', tipo: f.tipo, marca: '', preco: '', custo: '' })
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Cadastrar produto">
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU" required>{({ id }) => <Input id={id} value={f.sku} onChange={set('sku')} autoFocus />}</Field>
          <Field label="Tipo">{({ id }) => <Select id={id} value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
          <Field label="Nome" required className="sm:col-span-2">{({ id }) => <Input id={id} value={f.nome} onChange={set('nome')} />}</Field>
          <Field label="Marca">{({ id }) => <Input id={id} value={f.marca} onChange={set('marca')} />}</Field>
          <div />
          <Field label="Custo (R$)">{({ id }) => <Input id={id} inputMode="decimal" className="num" value={f.custo} onChange={set('custo')} />}</Field>
          <Field label="Preço de venda (R$)">{({ id }) => <Input id={id} inputMode="decimal" className="num" value={f.preco} onChange={set('preco')} />}</Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" loading={salvando}>Cadastrar produto</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Produtos() {
  const toast = useToast()
  const [produtos, setProdutos] = useState(null)
  const [erro, setErro] = useState(null)
  const [cat, setCat] = useState('monofocal')
  const [linha, setLinha] = useState(null)
  const [indice, setIndice] = useState(null)
  const [trat, setTrat] = useState(null)
  const [massa, setMassa] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)

  useEffect(() => {
    supabase.from('produtos').select('*').order('sku').then(({ data, error }) => {
      if (error) setErro(mensagemErro(error)); else setProdutos(data)
    })
  }, [])

  const atualizarLocal = (id, patch) => setProdutos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const lentes = useMemo(() => (produtos || []).filter((p) => p.tipo === 'lente'), [produtos])
  const daCat = lentes.filter((l) => l.atributos.categoria === cat)
  const linhas = [...new Set(daCat.map((l) => l.atributos.linha))]
  const indices = [...new Set(daCat.map((l) => Number(l.atributos.indice)))].sort()
  const trats = [...new Set(daCat.map((l) => l.atributos.tratamento))]
  const filtradas = daCat.filter((l) =>
    (!linha || l.atributos.linha === linha) && (!indice || Number(l.atributos.indice) === indice) && (!trat || l.atributos.tratamento === trat))
  const semPreco = lentes.filter((l) => !Number(l.preco)).length

  const outros = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return (produtos || []).filter((p) => p.tipo !== 'lente' && (!b || p.nome.toLowerCase().includes(b) || p.sku.toLowerCase().includes(b)))
  }, [produtos, busca])

  const aplicarEmMassa = async () => {
    const n = parseNum(massa)
    if (n === null || Number.isNaN(n) || n < 0) { toast('Informe um preço válido.', 'erro'); return }
    setAplicando(true)
    const ids = filtradas.map((f) => f.id)
    const { error } = await supabase.from('produtos').update({ preco: n }).in('id', ids)
    setAplicando(false)
    if (error) { toast(mensagemErro(error), 'erro'); return }
    setProdutos((ps) => ps.map((p) => (ids.includes(p.id) ? { ...p, preco: n } : p)))
    toast(`Preço ${brl(n)} aplicado em ${ids.length} lentes`)
    setMassa('')
  }

  const alternarAtivo = async (p, ativo) => {
    const { error } = await supabase.from('produtos').update({ ativo }).eq('id', p.id)
    if (error) { toast(mensagemErro(error), 'erro'); return }
    atualizarLocal(p.id, { ativo })
  }

  if (erro) return <div className="mx-auto max-w-3xl"><Alert>{erro}</Alert></div>
  if (!produtos) return <Spinner />

  const tabCls = 'h-10 rounded-md border px-4 text-sm font-semibold data-[state=active]:border-brand data-[state=active]:bg-brand data-[state=active]:text-surface data-[state=inactive]:border-line data-[state=inactive]:bg-surface'

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Lentes e preços</h1>
          <p className="mt-1 text-sm text-muted">{semPreco > 0 ? `${semPreco} de ${lentes.length} lentes ainda sem preço.` : 'Todas as lentes têm preço.'} As alterações salvam ao sair do campo.</p>
        </div>
      </div>

      <Tabs.Root defaultValue="lentes" className="flex flex-col gap-4">
        <Tabs.List className="flex gap-2" aria-label="Tipo de produto">
          <Tabs.Trigger value="lentes" className={tabCls}>Lentes</Tabs.Trigger>
          <Tabs.Trigger value="outros" className={tabCls}>Armações e outros</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="lentes" className="flex flex-col gap-4 focus:outline-none">
          <Section>
            <div className="flex flex-col gap-4">
              <Chips label="Categoria" value={cat} onChange={(v) => { if (v) { setCat(v); setLinha(null); setIndice(null); setTrat(null) } }}
                options={[{ value: 'monofocal', label: 'Monofocal' }, { value: 'multifocal', label: 'Multifocal' }]} />
              <Chips label="Linha" value={linha} onChange={setLinha} options={linhas.map((l) => ({ value: l, label: l.replace('MULTIFOCAL ', '') }))} />
              <Chips label="Índice" value={indice} onChange={setIndice} options={indices.map((i) => ({ value: i, label: i.toFixed(2).replace('.', ',') }))} />
              <Chips label="Tratamento" value={trat} onChange={setTrat} options={trats.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))} />
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <Field label={`Preço para as ${filtradas.length} lentes filtradas (R$)`}>
                  {({ id }) => <Input id={id} inputMode="decimal" className="num w-40" value={massa} onChange={(e) => setMassa(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0,00" />}
                </Field>
                <Button variant="secondary" onClick={aplicarEmMassa} loading={aplicando} disabled={!massa || filtradas.length === 0}>Aplicar a todas</Button>
              </div>
            </div>
          </Section>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Lente</th>
                  <th className="px-4 py-3 font-medium">Custo</th>
                  <th className="px-4 py-3 font-medium">Preço</th>
                  <th className="px-4 py-3 text-right font-medium">Margem</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((p) => {
                  const m = Number(p.preco) > 0 && Number(p.custo) > 0 ? (Number(p.preco) - Number(p.custo)) / Number(p.preco) : null
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2"><p className="font-medium">{p.nome}</p><p className="num text-xs text-muted">{p.sku}</p></td>
                      <td className="px-4 py-2"><PrecoCell produto={p} campo="custo" onSalvo={atualizarLocal} /></td>
                      <td className="px-4 py-2"><PrecoCell produto={p} campo="preco" onSalvo={atualizarLocal} /></td>
                      <td className="px-4 py-2 text-right num text-muted">{m === null ? '—' : `${(m * 100).toFixed(1).replace('.', ',')}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Tabs.Content>

        <Tabs.Content value="outros" className="flex flex-col gap-4 focus:outline-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Buscar produto" className="pl-9" placeholder="Buscar por nome ou SKU" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Button icon={Plus} onClick={() => setNovo(true)}>Cadastrar produto</Button>
          </div>
          {outros.length === 0 ? (
            <Section><p className="text-sm text-muted">{busca ? 'Nenhum produto encontrado.' : 'Cadastre armações, óculos solares e acessórios para vendê-los no PDV.'}</p></Section>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Produto</th><th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Custo</th><th className="px-4 py-3 font-medium">Preço</th><th className="px-4 py-3 font-medium">Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {outros.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2"><p className="font-medium">{p.nome}</p><p className="num text-xs text-muted">{p.sku}</p></td>
                      <td className="px-4 py-2 text-muted">{TIPOS[p.tipo]}</td>
                      <td className="px-4 py-2"><PrecoCell produto={p} campo="custo" onSalvo={atualizarLocal} /></td>
                      <td className="px-4 py-2"><PrecoCell produto={p} campo="preco" onSalvo={atualizarLocal} /></td>
                      <td className="px-4 py-2"><Switch checked={p.ativo} onCheckedChange={(v) => alternarAtivo(p, v)} label={<span className="sr-only">Ativo</span>} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
      <NovoProdutoModal open={novo} onOpenChange={setNovo} onCriado={(p) => setProdutos((ps) => [...ps, p])} />
    </div>
  )
}
