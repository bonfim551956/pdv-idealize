import { useEffect, useState } from 'react'
import { Search, UserPlus, X } from 'lucide-react'
import { supabase, mensagemErro } from '../../lib/supabase'
import { Button, Field, Input, Select, Modal, Alert, cx, useToast } from '../../components/ui'

export const ORIGENS = ['WhatsApp', 'Instagram', 'Facebook', 'Google', 'Indicação', 'Passante', 'Campanha', 'Cliente antigo']

const soDigitos = (s) => (s || '').replace(/\D/g, '')

export function cpfValido(cpf) {
  const c = soDigitos(cpf)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

const mascaraCPF = (v) =>
  soDigitos(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
const mascaraFone = (v) => {
  const d = soDigitos(v).slice(0, 11)
  return d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
}

function NovoClienteModal({ open, onOpenChange, empresaId, nomeInicial, onCriado }) {
  const toast = useToast()
  const [f, setF] = useState({ nome: '', documento: '', celular: '', origem: '', nascimento: '' })
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (open) { setF((x) => ({ ...x, nome: nomeInicial || '' })); setErros({}); setErro(null) } }, [open, nomeInicial])
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const salvar = async (e) => {
    e.preventDefault()
    const er = {}
    if (f.nome.trim().length < 3) er.nome = 'Informe o nome completo'
    if (f.documento && !cpfValido(f.documento)) er.documento = 'CPF inválido'
    if (soDigitos(f.celular).length < 10) er.celular = 'Informe um celular com DDD'
    if (!f.origem) er.origem = 'Escolha como o cliente chegou'
    setErros(er)
    if (Object.keys(er).length) return
    setSalvando(true); setErro(null)
    const { data, error } = await supabase
      .from('clientes')
      .insert({
        empresa_id: empresaId,
        nome: f.nome.trim().toUpperCase(),
        documento: soDigitos(f.documento) || null,
        data_nascimento: f.nascimento || null,
        origem: f.origem,
      })
      .select('id, nome, documento, origem')
      .single()
    if (error) { setErro(mensagemErro(error)); setSalvando(false); return }
    const { error: e2 } = await supabase.from('cliente_contatos').insert({ cliente_id: data.id, tipo: 'WHATSAPP', valor: soDigitos(f.celular), principal: true })
    setSalvando(false)
    if (e2) toast('Cliente salvo, mas o celular não foi gravado.', 'erro')
    else toast('Cliente cadastrado')
    onCriado(data)
    onOpenChange(false)
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Cadastrar cliente">
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome completo" required error={erros.nome}>
          {({ id, invalid }) => <Input id={id} invalid={invalid} value={f.nome} onChange={set('nome')} autoFocus />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CPF" error={erros.documento}>
            {({ id, invalid }) => <Input id={id} invalid={invalid} inputMode="numeric" value={f.documento} onChange={(e) => setF((x) => ({ ...x, documento: mascaraCPF(e.target.value) }))} placeholder="000.000.000-00" />}
          </Field>
          <Field label="Data de nascimento">
            {({ id }) => <Input id={id} type="date" value={f.nascimento} onChange={set('nascimento')} />}
          </Field>
          <Field label="Celular / WhatsApp" required error={erros.celular}>
            {({ id, invalid }) => <Input id={id} invalid={invalid} inputMode="tel" value={f.celular} onChange={(e) => setF((x) => ({ ...x, celular: mascaraFone(e.target.value) }))} placeholder="(15) 99999-9999" />}
          </Field>
          <Field label="Como chegou até a loja" required error={erros.origem}>
            {({ id, invalid }) => (
              <Select id={id} invalid={invalid} value={f.origem} onChange={set('origem')}>
                <option value="">Selecione</option>
                {ORIGENS.map((o) => <option key={o}>{o}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" loading={salvando}>Cadastrar cliente</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function ClientePicker({ value, onChange, empresaId, label = 'Cliente', error }) {
  const [busca, setBusca] = useState('')
  const [res, setRes] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [novo, setNovo] = useState(false)

  useEffect(() => {
    const b = busca.trim().replace(/[,()]/g, ' ')
    if (b.length < 2) { setRes([]); return }
    setBuscando(true)
    const t = setTimeout(async () => {
      const d = soDigitos(b)
      const filtro = d.length >= 3 ? `nome.ilike.%${b}%,documento.ilike.%${d}%` : `nome.ilike.%${b}%`
      const { data } = await supabase.from('clientes').select('id, nome, documento, origem').or(filtro).order('nome').limit(8)
      setRes(data || [])
      setBuscando(false)
    }, 250)
    return () => clearTimeout(t)
  }, [busca])

  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted">{label}</span>
        <div className="flex items-center justify-between gap-4 rounded-md border border-brand bg-brand-soft px-4 py-3">
          <div>
            <p className="font-semibold">{value.nome}</p>
            <p className="text-xs text-muted">{value.documento ? `CPF ${mascaraCPF(value.documento)}` : 'Sem CPF'}{value.origem ? ` · chegou por ${value.origem}` : ''}</p>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={() => onChange(null)}>Trocar</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Field label={label} error={error}>
        {({ id, invalid }) => (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input id={id} invalid={invalid} className="pl-9" placeholder="Nome ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
          </div>
        )}
      </Field>
      {busca.trim().length >= 2 && (
        <ul className="mt-1 overflow-hidden rounded-md border border-line bg-surface" role="listbox">
          {res.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { onChange(c); setBusca('') }} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-brand-soft">
                <span className="font-medium">{c.nome}</span>
                <span className="text-xs text-muted num">{c.documento ? mascaraCPF(c.documento) : ''}</span>
              </button>
            </li>
          ))}
          {!buscando && res.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nenhum cliente com esse nome ou CPF.</li>}
          <li className={cx(res.length && 'border-t border-line')}>
            <button type="button" onClick={() => setNovo(true)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-brand hover:bg-brand-soft">
              <UserPlus className="h-4 w-4" aria-hidden /> Cadastrar “{busca.trim()}”
            </button>
          </li>
        </ul>
      )}
      <NovoClienteModal open={novo} onOpenChange={setNovo} empresaId={empresaId} nomeInicial={/\d/.test(busca) ? '' : busca.trim()} onCriado={(c) => { onChange(c); setBusca('') }} />
    </div>
  )
}
