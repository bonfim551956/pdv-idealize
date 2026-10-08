import { useMemo, useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { brl, somaDias, hojeISO } from '../../lib/format'
import { olhoVazio } from '../../lib/receita'
import { Field, Input, Select, Switch, Chips, Section, Button, Textarea, cx } from '../../components/ui'
import ReceitaGrid from './ReceitaGrid'
import ClientePicker from './ClientePicker'

export const PRAZO_PADRAO_DIAS = 10
const dataLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const novaOS = (letra) => ({
  letra,
  usarReceitaA: letra !== 'A', // OS B, C… herdam graus e DNP da OS A; altura é de cada OS
  pacienteEhCliente: true,
  paciente: null,
  data_receita: hojeISO(),
  previsao_entrega: dataLocalISO(somaDias(PRAZO_PADRAO_DIAS)), // retirada: só a data, prazo padrão de 10 dias
  aviso_entrega: 'WHATSAPP',
  laboratorio_id: '',
  iniciais: '',
  observacoes: '',
  receita: { OD: olhoVazio(), OE: olhoVazio() },
  armacao: { propria: false, produto: null, mha: '', mva: '', ponte: '', dma: '', tipo: 'fechada', modelo_desenho: '', enviar_montagem: true, clipon: false },
  lentes: { mesma: true, OD: { produto: null, dnp: '', altura: '' }, OE: { produto: null, dnp: '', altura: '' } },
})

/* ---------- Lente: filtros encadeados ---------- */
const ORDEM_TRAT = ['AR', 'BLUE', 'BLUE AR', 'BLUE INCOLOR', 'FOTOCROMATICO', 'TRANSITIONS']
const rotuloIndice = (i) => Number(i).toFixed(2).replace('.', ',')

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

  return (
    <div className="flex flex-col gap-4">
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
            options={trats.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))} />
        </div>
      )}
      {value && (
        <div className={cx('flex items-center justify-between rounded-md border-l-4 bg-surface px-4 py-3', cor === 'oe' ? 'border-oe' : 'border-od')}>
          <div>
            <p className="font-semibold">{value.nome}</p>
            <p className="text-xs text-muted num">SKU {value.sku}</p>
          </div>
          <p className={cx('num font-semibold', Number(value.preco) === 0 && 'text-warn')}>
            {Number(value.preco) === 0 ? 'Sem preço' : `${brl(value.preco)} / un.`}
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
export default function OSForm({ os, osA, onChange, cliente, empresaId, lentes, armacoes, laboratorios, erros = {} }) {
  const set = (patch) => onChange({ ...os, ...patch })
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
      <Section title="Paciente e entrega">
        <div className="flex flex-col gap-4">
          <Switch
            checked={os.pacienteEhCliente}
            onCheckedChange={(v) => set({ pacienteEhCliente: v, paciente: v ? null : os.paciente })}
            label={`O paciente é ${cliente ? cliente.nome.split(' ')[0] : 'o próprio cliente'}`}
          />
          {!os.pacienteEhCliente && (
            <ClientePicker label="Paciente" value={os.paciente} onChange={(p) => set({ paciente: p })} empresaId={empresaId} error={erros.paciente} />
          )}
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

      <Section title="Receita e medidas" aside={osA && (
        <Switch checked={os.usarReceitaA} onCheckedChange={(v) => set(v ? { usarReceitaA: true } : {
          usarReceitaA: false,
          // ao desligar, a OS começa com uma cópia da receita da OS A para ajustar
          receita: JSON.parse(JSON.stringify(osA.receita)),
          lentes: { ...os.lentes, OD: { ...os.lentes.OD, dnp: osA.lentes.OD.dnp }, OE: { ...os.lentes.OE, dnp: osA.lentes.OE.dnp } },
        })} label="Mesma receita e DNP da OS A" />
      )}>
        {osA && os.usarReceitaA ? (
          <ReceitaGrid travado receita={osA.receita} onChange={() => {}} exigeAdicao={multifocal}
            medidas={{ OD: { dnp: osA.lentes.OD.dnp, altura: os.lentes.OD.altura }, OE: { dnp: osA.lentes.OE.dnp, altura: os.lentes.OE.altura } }}
            onMedida={(olho, patch) => patch.altura !== undefined && setOlhoLente(olho, { altura: patch.altura })} errosMedidas={erros} />
        ) : (
          <ReceitaGrid receita={os.receita} onChange={(receita) => set({ receita })} exigeAdicao={multifocal}
            medidas={os.lentes} onMedida={setOlhoLente} errosMedidas={erros} />
        )}
        {erros.receita && <p className="mt-2 text-sm text-danger" role="alert">{erros.receita}</p>}
      </Section>

      <Section title="Armação" aside={<Switch checked={os.armacao.propria} onCheckedChange={(v) => setArm({ propria: v, produto: v ? null : os.armacao.produto, tipo: v ? 'propria_cliente' : 'fechada' })} label="Armação do cliente" />}>
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
                  <option value="fechada">Fechado</option><option value="fio_nylon">Fio de nylon</option>
                  <option value="parafusada">Parafusado</option><option value="propria_cliente">Armação do cliente</option>
                </Select>
              )}
            </Field>
            <Field label="Modelo / desenho">
              {({ id }) => <Input id={id} value={os.armacao.modelo_desenho} onChange={(e) => setArm({ modelo_desenho: e.target.value })} />}
            </Field>
          </div>
          <div className="flex flex-wrap gap-6">
            <Switch checked={os.armacao.enviar_montagem} onCheckedChange={(v) => setArm({ enviar_montagem: v })} label="Enviar para montagem" />
            <Switch checked={os.armacao.clipon} onCheckedChange={(v) => setArm({ clipon: v })} label="Clip-on" />
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
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Field label="Iniciais na lente" hint="Opcional">
            {({ id }) => <Input id={id} maxLength={6} value={os.iniciais} onChange={(e) => set({ iniciais: e.target.value.toUpperCase() })} />}
          </Field>
          <Field label="Observações da OS">
            {({ id }) => <Textarea id={id} value={os.observacoes} onChange={(e) => set({ observacoes: e.target.value })} placeholder="Ex.: cliente prefere lente mais fina, conferir centro óptico" />}
          </Field>
        </div>
      </Section>
    </div>
  )
}
