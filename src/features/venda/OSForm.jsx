import { useMemo, useState, useEffect } from 'react'
import { Search, X, Stethoscope } from 'lucide-react'
import { brl, somaDias, hojeISO } from '../../lib/format'
import { olhoVazio } from '../../lib/receita'
import { Field, Input, Select, Switch, Chips, Section, Button, Textarea, cx } from '../../components/ui'
import ReceitaGrid from './ReceitaGrid'
import ReceitaExameModal, { receitaDoExame } from './ReceitaExameModal'

export const TIPOS_ARO = [
  ['acetato', 'Acetato'],
  ['metal_fechado', 'Metal fechado'],
  ['metal_redondo', 'Metal redondo'],
  ['fio_nylon', 'Fio de nylon'],
  ['balgriff', 'Balgriff'],
  ['parafusada', 'Parafusado (3 peças)'],
  ['outro', 'Outro'],
]

export const PRAZO_PADRAO_DIAS = 10
const dataLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Cada item é um óculos: letra = cliente (OS A, OS B…), oculos = 1, 2, 3… dentro do cliente
export const novaOS = (letra, oculos = 1) => ({
  letra,
  oculos,
  usarBase: oculos > 1, // óculos 2, 3… herdam graus e DNP do óculos 1 do mesmo cliente; altura é de cada óculos
  data_receita: hojeISO(),
  previsao_entrega: dataLocalISO(somaDias(PRAZO_PADRAO_DIAS)), // retirada: só a data, prazo padrão de 10 dias
  aviso_entrega: 'WHATSAPP',
  laboratorio_id: '',
  iniciais: '',
  observacoes: '',
  receita: { OD: olhoVazio(), OE: olhoVazio() },
  armacao: { propria: false, produto: null, mha: '', mva: '', ponte: '', dma: '', tipo: '', modelo_desenho: '', enviar_montagem: true, clipon: false },
  lentes: { mesma: true, OD: { produto: null, dnp: '', altura: '' }, OE: { produto: null, dnp: '', altura: '' } },
})

/* ---------- Lente: filtros encadeados ---------- */
const ORDEM_TRAT = ['AR', 'BLUE AR', 'BLUE INCOLOR', 'FOTOCROMATICO AR', 'FOTOCROMATICO INCOLOR', 'TRANSITIONS AR', 'TRANSITIONS INCOLOR']
const ROTULO_TRAT = {
  AR: 'AR', 'BLUE AR': 'Blue AR', 'BLUE INCOLOR': 'Blue incolor', BLUE: 'Blue',
  'FOTOCROMATICO AR': 'Fotocromático AR', 'FOTOCROMATICO INCOLOR': 'Fotocromático incolor',
  'TRANSITIONS AR': 'Transitions AR', 'TRANSITIONS INCOLOR': 'Transitions incolor',
}
const rotuloIndice = (i) => Number(i).toFixed(2).replace('.', ',')

// Busca por nome: cada palavra digitada precisa casar com o início de alguma palavra da lente
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const APELIDOS = {
  'FOTOCROMATICO AR': 'foto fotocromatica fotossensivel ar antirreflexo', 'FOTOCROMATICO INCOLOR': 'foto fotocromatica fotossensivel incolor',
  'TRANSITIONS AR': 'transitions trans ar antirreflexo', 'TRANSITIONS INCOLOR': 'transitions trans incolor',
  'BLUE AR': 'blue azul filtro ar antirreflexo', 'BLUE INCOLOR': 'blue azul filtro incolor', AR: 'ar antirreflexo',
}
function textoBusca(l) {
  const a = l.atributos || {}
  const ind = Number(a.indice)
  return normalizar([
    l.nome, l.sku, a.linha, a.categoria, a.tratamento, APELIDOS[a.tratamento],
    ind.toFixed(2), ind.toFixed(2).replace('.', ''), ind.toFixed(2).replace('.', ','),
    ind === 1.59 ? 'poli policarbonato' : '', a.categoria === 'multifocal' ? 'multi progressiva' : 'mono visao simples',
  ].join(' ')).split(/[^a-z0-9.,%]+/).filter(Boolean)
}
function BuscaLente({ lentes, onEscolher }) {
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const indice = useMemo(() => lentes.map((l) => ({ l, palavras: textoBusca(l) })), [lentes])
  const termos = normalizar(q).split(/\s+/).filter(Boolean)
  const resultados = termos.length === 0 ? [] : indice
    .filter(({ palavras }) => termos.every((t) => palavras.some((p) => p.startsWith(t))))
    .map(({ l }) => l)
    .sort((a, b) => Number(a.preco) - Number(b.preco))
    .slice(0, 8)
  const escolher = (l) => { onEscolher(l); setQ(''); setAberto(false) }
  const teclas = (e) => {
    if (!resultados.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(resultados[ativo] || resultados[0]) }
    else if (e.key === 'Escape') setAberto(false)
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input aria-label="Buscar lente pelo nome" className="pl-9" value={q} placeholder="Buscar lente: ex. extra 1.56 blue ar, rubi 1.67 foto, multi 70 transitions"
        onChange={(e) => { setQ(e.target.value); setAberto(true); setAtivo(0) }} onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)} onKeyDown={teclas} />
      {q && (
        <button type="button" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label="Limpar busca"><X className="h-4 w-4" /></button>
      )}
      {aberto && termos.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {resultados.length === 0 ? <li className="px-4 py-3 text-sm text-muted">Nenhuma lente encontrada.</li> : resultados.map((l, i) => (
            <li key={l.id} role="option" aria-selected={i === ativo}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(l)} onMouseEnter={() => setAtivo(i)}
                className={cx('flex w-full items-center justify-between gap-4 px-4 py-2 text-left text-sm', i === ativo ? 'bg-brand-soft' : 'hover:bg-brand-soft')}>
                <span className="font-medium">{l.nome}</span>
                <span className={cx('num shrink-0', Number(l.preco) === 0 ? 'text-warn' : 'text-muted')}>{Number(l.preco) === 0 ? 'Sem preço' : `par ${brl(l.preco * 2)}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LenteSelector({ lentes, value, onChange, cor }) {
  const inicial = value
    ? { categoria: value.atributos.categoria, linha: value.atributos.linha, indice: value.atributos.indice, tratamento: value.atributos.tratamento }
    : { categoria: null, linha: null, indice: null, tratamento: null }
  const [sel, setSel] = useState(inicial)

  const filtra = (s, ate) =>
    lentes.filter((l) => {
      const a = l.atributos
      if (ate >= 1 && s.categoria && a.categoria !== s.categoria) return false
      if (ate >= 2 && s.linha && a.linha !== s.linha) return false
      if (ate >= 3 && s.indice && Number(a.indice) !== Number(s.indice)) return false
      return true
    })
  const unicos = (arr, fn) => [...new Set(arr.map(fn))]

  const linhas = unicos(filtra(sel, 1), (l) => l.atributos.linha)
  const indices = unicos(filtra(sel, 2), (l) => Number(l.atributos.indice)).sort()
  const trats = unicos(filtra(sel, 3), (l) => l.atributos.tratamento).sort((a, b) => ORDEM_TRAT.indexOf(a) - ORDEM_TRAT.indexOf(b))

  const escolher = (k, v) => {
    const ordem = ['categoria', 'linha', 'indice', 'tratamento']
    const i = ordem.indexOf(k)
    const novo = { ...sel, [k]: v }
    ordem.slice(i + 1).forEach((x) => (novo[x] = null))
    setSel(novo)
    const prod = lentes.find(
      (l) => l.atributos.categoria === novo.categoria && l.atributos.linha === novo.linha &&
        Number(l.atributos.indice) === Number(novo.indice) && l.atributos.tratamento === novo.tratamento
    )
    onChange(prod || null)
  }

  const escolherDaBusca = (l) => {
    const a = l.atributos
    setSel({ categoria: a.categoria, linha: a.linha, indice: Number(a.indice), tratamento: a.tratamento })
    onChange(l)
  }

  return (
    <div className="flex flex-col gap-4">
      <BuscaLente lentes={lentes} onEscolher={escolherDaBusca} />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Tipo</span>
        <Chips label="Tipo de lente" value={sel.categoria} onChange={(v) => escolher('categoria', v)}
          options={[{ value: 'monofocal', label: 'Monofocal' }, { value: 'multifocal', label: 'Multifocal' }]} />
      </div>
      {sel.categoria && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">{sel.categoria === 'multifocal' ? 'Campo de visão' : 'Linha'}</span>
          <Chips label="Linha" value={sel.linha} onChange={(v) => escolher('linha', v)}
            options={linhas.map((l) => ({ value: l, label: l.replace('MULTIFOCAL ', '') }))} />
        </div>
      )}
      {sel.linha && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">Índice de refração</span>
          <Chips label="Índice" value={sel.indice} onChange={(v) => escolher('indice', v)}
            options={indices.map((i) => ({ value: i, label: rotuloIndice(i) }))} />
        </div>
      )}
      {sel.indice && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">Tratamento</span>
          <Chips label="Tratamento" value={sel.tratamento} onChange={(v) => escolher('tratamento', v)}
            options={trats.map((t) => ({ value: t, label: ROTULO_TRAT[t] || t }))} />
        </div>
      )}
      {value && (
        <div className={cx('flex items-center justify-between rounded-md border-l-4 bg-surface px-4 py-3', cor === 'oe' ? 'border-oe' : 'border-od')}>
          <div>
            <p className="font-semibold">{value.nome}</p>
            <p className="text-xs text-muted num">SKU {value.sku}</p>
          </div>
          <p className={cx('num font-semibold', Number(value.preco) === 0 && 'text-warn')}>
            {Number(value.preco) === 0 ? 'Sem preço' : `${brl(value.preco)} / peça · par ${brl(value.preco * 2)} ou 10x ${brl(Math.ceil(value.preco * 2 * 10) / 100)}`}
          </p>
        </div>
      )}
    </div>
  )
}

/* ---------- Armação: busca local ---------- */
function ArmacaoBusca({ armacoes, value, onChange }) {
  const [q, setQ] = useState('')
  const res = useMemo(() => {
    const b = q.trim().toLowerCase()
    if (b.length < 2) return []
    return armacoes.filter((a) => a.nome.toLowerCase().includes(b) || a.sku.toLowerCase().includes(b)).slice(0, 8)
  }, [q, armacoes])

  if (value) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-bg px-4 py-3">
        <div>
          <p className="font-semibold">{value.nome}</p>
          <p className="text-xs text-muted num">SKU {value.sku} · {brl(value.preco)}</p>
        </div>
        <Button variant="ghost" size="sm" icon={X} onClick={() => onChange(null)}>Trocar</Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input aria-label="Buscar armação" className="pl-9" placeholder="Buscar armação por nome ou SKU" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim().length >= 2 && (
        <ul className="overflow-hidden rounded-md border border-line bg-surface">
          {res.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => { onChange(a); setQ('') }} className="flex w-full justify-between px-4 py-3 text-left hover:bg-brand-soft">
                <span className="font-medium">{a.nome}</span><span className="num text-sm text-muted">{brl(a.preco)}</span>
              </button>
            </li>
          ))}
          {res.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">
              {armacoes.length === 0 ? 'Nenhuma armação cadastrada ainda. Cadastre em Lentes e preços ou marque “Armação do cliente”.' : 'Nenhuma armação encontrada.'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

const num = (v) => v.replace(/[^\d,.]/g, '')

/* ---------- OS completa ---------- */
export default function OSForm({ os, base, onChange, lentes, armacoes, laboratorios, erros = {}, paciente }) {
  const set = (patch) => onChange({ ...os, ...patch })
  const [buscarExame, setBuscarExame] = useState(false)
  const usarExame = (r) => {
    const x = receitaDoExame(r)
    set({
      receita: x.receita,
      receita_exame_id: r.id,
      receita_exame_info: `${r.paciente_nome} · exame ${x.data ? x.data.split('-').reverse().join('/') : ''}`,
      ...(x.data ? { data_receita: x.data } : {}),
      lentes: {
        ...os.lentes,
        OD: { ...os.lentes.OD, ...(x.dnp.OD ? { dnp: x.dnp.OD } : {}) },
        OE: { ...os.lentes.OE, ...(x.dnp.OE ? { dnp: x.dnp.OE } : {}) },
      },
    })
  }
  const buscaInicial = paciente?.celular?.replace(/\D/g, '').length >= 10 ? paciente.celular : (paciente?.nome || '')
  const setArm = (patch) => set({ armacao: { ...os.armacao, ...patch } })
  const setLen = (patch) => set({ lentes: { ...os.lentes, ...patch } })
  const setOlhoLente = (olho, patch) => setLen({ [olho]: { ...os.lentes[olho], ...patch } })

  const multifocal = [os.lentes.OD.produto, os.lentes.OE.produto].some((p) => p?.atributos?.categoria === 'multifocal')

  // lente única replica para OE
  useEffect(() => {
    if (os.lentes.mesma && os.lentes.OE.produto?.id !== os.lentes.OD.produto?.id) setOlhoLente('OE', { produto: os.lentes.OD.produto })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os.lentes.mesma, os.lentes.OD.produto])

  return (
    <div className="flex flex-col gap-6">
      <Section title="Entrega e laboratório">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Data da receita" required>
              {({ id }) => <Input id={id} type="date" value={os.data_receita} onChange={(e) => set({ data_receita: e.target.value })} />}
            </Field>
            <Field label="Data de retirada" required error={erros.previsao_entrega} hint={`Padrão: ${PRAZO_PADRAO_DIAS} dias`}>
              {({ id, invalid }) => <Input id={id} invalid={invalid} type="date" min={hojeISO()} value={os.previsao_entrega} onChange={(e) => set({ previsao_entrega: e.target.value })} />}
            </Field>
            <Field label="Aviso de entrega">
              {({ id }) => (
                <Select id={id} value={os.aviso_entrega} onChange={(e) => set({ aviso_entrega: e.target.value })}>
                  <option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL">E-mail</option>
                  <option value="TELEFONE">Telefone</option><option value="NENHUM">Não avisar</option>
                </Select>
              )}
            </Field>
            <Field label="Laboratório">
              {({ id }) => (
                <Select id={id} value={os.laboratorio_id} onChange={(e) => set({ laboratorio_id: e.target.value })}>
                  <option value="">Não informado</option>
                  {laboratorios.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </Select>
              )}
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Receita e medidas" aside={(
        <div className="flex flex-wrap items-center gap-3">
          {!(base && os.usarBase) && (
            <Button variant="secondary" size="sm" icon={Stethoscope} onClick={() => setBuscarExame(true)}>Buscar receita do exame</Button>
          )}
          {base && (
        <Switch checked={os.usarBase} onCheckedChange={(v) => set(v ? { usarBase: true } : {
          usarBase: false,
          // ao desligar, este óculos começa com uma cópia da receita do óculos 1 para ajustar
          receita: JSON.parse(JSON.stringify(base.receita)),
          lentes: { ...os.lentes, OD: { ...os.lentes.OD, dnp: base.lentes.OD.dnp }, OE: { ...os.lentes.OE, dnp: base.lentes.OE.dnp } },
        })} label="Mesma receita e DNP do Óculos 1" />
          )}
        </div>
      )}>
        {os.receita_exame_id && !(base && os.usarBase) && (
          <p className="mb-3 inline-flex items-center gap-2 rounded-md bg-brand-soft px-3 py-1.5 text-sm text-brand">
            <Stethoscope className="h-4 w-4" />Receita do nosso exame: <span className="font-semibold capitalize">{os.receita_exame_info}</span>
            <button type="button" className="ml-1 text-muted underline hover:text-ink" onClick={() => set({ receita_exame_id: null, receita_exame_info: null })}>desvincular</button>
          </p>
        )}
        <ReceitaExameModal open={buscarExame} onOpenChange={setBuscarExame} buscaInicial={buscaInicial} onUsar={usarExame} />
        {base && os.usarBase ? (
          <ReceitaGrid travado travadoTexto="Graus e DNP vêm do Óculos 1. Informe só a altura, que depende da armação deste óculos." receita={base.receita} onChange={() => {}} exigeAdicao={multifocal}
            medidas={{ OD: { dnp: base.lentes.OD.dnp, altura: os.lentes.OD.altura }, OE: { dnp: base.lentes.OE.dnp, altura: os.lentes.OE.altura } }}
            onMedida={(olho, patch) => patch.altura !== undefined && setOlhoLente(olho, { altura: patch.altura })} errosMedidas={erros} />
        ) : (
          <ReceitaGrid receita={os.receita} onChange={(receita) => set({ receita })} exigeAdicao={multifocal}
            medidas={os.lentes} onMedida={setOlhoLente} errosMedidas={erros} />
        )}
        {erros.receita && <p className="mt-2 text-sm text-danger" role="alert">{erros.receita}</p>}
      </Section>

      <Section title="Armação" aside={<Switch checked={os.armacao.propria} onCheckedChange={(v) => setArm({ propria: v, produto: v ? null : os.armacao.produto })} label="Armação do cliente" />}>
        <div className="flex flex-col gap-4">
          {!os.armacao.propria && <ArmacaoBusca armacoes={armacoes} value={os.armacao.produto} onChange={(p) => setArm({ produto: p })} />}
          {erros.armacao && <p className="text-sm text-danger" role="alert">{erros.armacao}</p>}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[['mha', 'M.H.A'], ['mva', 'M.V.A'], ['ponte', 'Ponte'], ['dma', 'D.M.A']].map(([k, l]) => (
              <Field key={k} label={`${l} (mm)`}>
                {({ id }) => <Input id={id} inputMode="decimal" className="num" value={os.armacao[k]} onChange={(e) => setArm({ [k]: num(e.target.value) })} />}
              </Field>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de aro">
              {({ id }) => (
                <Select id={id} value={os.armacao.tipo} onChange={(e) => setArm({ tipo: e.target.value })}>
                  <option value="">Selecione</option>
                  {TIPOS_ARO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Modelo / desenho">
              {({ id }) => <Input id={id} value={os.armacao.modelo_desenho} onChange={(e) => setArm({ modelo_desenho: e.target.value })} />}
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Lentes" aside={<Switch checked={os.lentes.mesma} onCheckedChange={(v) => setLen({ mesma: v })} label="Mesma lente nos dois olhos" />}>
        <div className="flex flex-col gap-6">
          {os.lentes.mesma ? (
            <LenteSelector lentes={lentes} value={os.lentes.OD.produto} onChange={(p) => setOlhoLente('OD', { produto: p })} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {['OD', 'OE'].map((o) => (
                <div key={o} className={cx('flex flex-col gap-3 rounded-lg p-4', o === 'OD' ? 'bg-od-soft' : 'bg-oe-soft')}>
                  <span className={cx('self-start rounded px-2 py-1 text-sm font-bold text-surface', o === 'OD' ? 'bg-od' : 'bg-oe')}>{o}</span>
                  <LenteSelector key={`${o}-sep`} lentes={lentes} cor={o.toLowerCase()} value={os.lentes[o].produto} onChange={(p) => setOlhoLente(o, { produto: p })} />
                </div>
              ))}
            </div>
          )}
          {erros.lentes && <p className="text-sm text-danger" role="alert">{erros.lentes}</p>}
        </div>
      </Section>

      <Section title="Para o laboratório">
        <div className="grid gap-4">
          <Field label="Observações da OS">
            {({ id }) => <Textarea id={id} value={os.observacoes} onChange={(e) => set({ observacoes: e.target.value })} placeholder="Ex.: cliente prefere lente mais fina, conferir centro óptico" />}
          </Field>
        </div>
      </Section>
    </div>
  )
}
