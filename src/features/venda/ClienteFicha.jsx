import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Search, UserCheck, X, Loader2 } from 'lucide-react'
import { supabase, mensagemErro } from '../../lib/supabase'
import { Field, Input, Select, Button, Alert, cx } from '../../components/ui'
import { cpfValido, ORIGENS } from './ClientePicker'

const soDigitos = (s) => (s || '').replace(/\D/g, '')
const mascaraCPF = (v) => soDigitos(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
const mascaraFone = (v) => {
  const d = soDigitos(v).slice(0, 11)
  return d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
}
const mascaraCEP = (v) => soDigitos(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

const vazio = { id: null, nome: '', documento: '', celular: '', nascimento: '', origem: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'SP', enderecoId: null, contatoId: null }

/*
  Ficha do cliente sempre visível na 1ª etapa da venda.
  - Busca no topo: se já é cliente, preenche a ficha.
  - Campos obrigatórios à mostra: nome, CPF, celular e como chegou.
  - salvar() é chamado pelo "Continuar": cria ou atualiza o cliente e devolve o registro.
*/
export const fichaVazia = () => ({ ...vazio })

// O estado da ficha fica no componente pai para não se perder ao voltar de etapa
const ClienteFicha = forwardRef(function ClienteFicha({ empresaId, onClienteSalvo, ficha: f, setFicha: setF }, ref) {
  const [erros, setErros] = useState({})
  const [erro, setErro] = useState(null)
  const [busca, setBusca] = useState('')
  const [res, setRes] = useState([])
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [avisoCep, setAvisoCep] = useState(null)
  const [avisoCpf, setAvisoCpf] = useState(null)
  const [buscandoCpf, setBuscandoCpf] = useState(false)
  const numeroRef = useRef(null)
  const logradouroRef = useRef(null)

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  // busca de clientes já cadastrados
  useEffect(() => {
    const b = busca.trim().replace(/[,()%]/g, ' ')
    if (b.length < 2) { setRes([]); return }
    const t = setTimeout(async () => {
      const d = soDigitos(b)
      const filtro = d.length >= 3 ? `nome.ilike.%${b}%,documento.ilike.%${d}%` : `nome.ilike.%${b}%`
      const { data } = await supabase.from('clientes').select('id, nome, documento').or(filtro).order('nome').limit(8)
      setRes(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [busca])

  const escolher = async (c) => {
    setBusca(''); setRes([])
    const { data } = await supabase.from('clientes')
      .select('id, nome, documento, data_nascimento, origem, contatos:cliente_contatos(id, valor, principal), enderecos:cliente_enderecos(id, cep, logradouro, numero, complemento, bairro, cidade, uf)')
      .eq('id', c.id).single()
    if (!data) return
    const ct = data.contatos?.find((x) => x.principal) || data.contatos?.[0]
    const en = data.enderecos?.[0]
    const ficha = {
      id: data.id, nome: data.nome, documento: mascaraCPF(data.documento || ''), celular: mascaraFone(ct?.valor || ''),
      nascimento: data.data_nascimento || '', origem: data.origem || '', contatoId: ct?.id || null,
      cep: mascaraCEP(en?.cep || ''), logradouro: en?.logradouro || '', numero: en?.numero || '', complemento: en?.complemento || '',
      bairro: en?.bairro || '', cidade: en?.cidade || '', uf: en?.uf || 'SP', enderecoId: en?.id || null,
    }
    setF(ficha); setErros({})
  }

  const limpar = () => { setF({ ...vazio }); setErros({}); setErro(null); setAvisoCpf(null) }

  // CPF completo e válido: se já é cliente da Idealize, preenche a ficha inteira (sem custo)
  const reconhecerCpf = async (cpfMascarado) => {
    const doc = soDigitos(cpfMascarado)
    if (doc.length !== 11 || !cpfValido(doc) || f.id) return
    setBuscandoCpf(true)
    const { data } = await supabase.from('clientes').select('id, nome, documento').eq('documento', doc).limit(1).maybeSingle()
    setBuscandoCpf(false)
    if (data) {
      await escolher(data)
      setAvisoCpf(`Cliente encontrado pelo CPF: ${data.nome}. Os dados foram preenchidos; confira com o cliente.`)
    } else setAvisoCpf(null)
  }

  // CEP preenche o endereço sozinho assim que tiver 8 dígitos (ViaCEP, com BrasilAPI de reserva)
  const buscarCep = async (cepDigitado) => {
    const cep = soDigitos(cepDigitado ?? f.cep)
    if (cep.length !== 8) return
    setBuscandoCep(true); setAvisoCep(null)
    setErros((e) => ({ ...e, cep: undefined }))
    let end = null
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json())
      if (!r.erro) end = { logradouro: r.logradouro, bairro: r.bairro, cidade: r.localidade, uf: r.uf }
    } catch { /* tenta a reserva */ }
    if (!end) {
      try {
        const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`)
        if (r.ok) { const j = await r.json(); end = { logradouro: j.street, bairro: j.neighborhood, cidade: j.city, uf: j.state } }
      } catch { /* sem internet */ }
    }
    setBuscandoCep(false)
    if (!end) { setAvisoCep('CEP não encontrado. Confira o número ou preencha o endereço manualmente.'); return }
    setF((x) => ({ ...x, logradouro: end.logradouro || x.logradouro, bairro: end.bairro || x.bairro, cidade: end.cidade || x.cidade, uf: end.uf || x.uf }))
    // CEP genérico de cidade pequena vem sem rua: deixa o cursor na rua; senão vai direto ao número
    setTimeout(() => (end.logradouro ? numeroRef.current : logradouroRef.current)?.focus(), 0)
  }

  const validar = () => {
    const e = {}
    if (f.nome.trim().split(/\s+/).length < 2) e.nome = 'Informe nome e sobrenome'
    if (!soDigitos(f.documento)) e.documento = 'Obrigatório'
    else if (!cpfValido(f.documento)) e.documento = 'CPF inválido'
    if (soDigitos(f.celular).length < 10) e.celular = 'Celular com DDD'
    if (!f.origem) e.origem = 'Obrigatório'
    // Endereço obrigatório
    if (soDigitos(f.cep).length !== 8) e.cep = 'CEP com 8 dígitos'
    if (!f.logradouro.trim()) e.logradouro = 'Obrigatório'
    if (!f.numero.trim()) e.numero = 'Obrigatório'
    if (!f.bairro.trim()) e.bairro = 'Obrigatório'
    if (!f.cidade.trim()) e.cidade = 'Obrigatório'
    setErros(e)
    return Object.keys(e).length === 0
  }

  useImperativeHandle(ref, () => ({
    async salvar() {
      setErro(null)
      if (!validar()) return null
      const dados = {
        nome: f.nome.trim().toUpperCase(), documento: soDigitos(f.documento),
        data_nascimento: f.nascimento || null, origem: f.origem,
      }
      let cliente
      if (f.id) {
        const { error } = await supabase.from('clientes').update(dados).eq('id', f.id)
        if (error) { setErro(mensagemErro(error)); return null }
        cliente = { id: f.id, ...dados }
      } else {
        const { data, error } = await supabase.from('clientes').insert({ ...dados, empresa_id: empresaId }).select('id').single()
        if (error) { setErro(mensagemErro(error)); return null }
        cliente = { id: data.id, ...dados }
      }
      // contato principal
      const cel = soDigitos(f.celular)
      if (f.contatoId) await supabase.from('cliente_contatos').update({ valor: cel }).eq('id', f.contatoId)
      else {
        const { data } = await supabase.from('cliente_contatos').insert({ cliente_id: cliente.id, tipo: 'WHATSAPP', valor: cel, principal: true }).select('id').single()
        if (data) setF((x) => ({ ...x, contatoId: data.id }))
      }
      // endereço
      {
        const end = { cep: soDigitos(f.cep), logradouro: f.logradouro.trim(), numero: f.numero.trim(), complemento: f.complemento.trim() || null, bairro: f.bairro.trim(), cidade: f.cidade.trim(), uf: f.uf }
        if (f.enderecoId) await supabase.from('cliente_enderecos').update(end).eq('id', f.enderecoId)
        else {
          const { data } = await supabase.from('cliente_enderecos').insert({ ...end, cliente_id: cliente.id }).select('id').single()
          if (data) setF((x) => ({ ...x, enderecoId: data.id }))
        }
      }
      setF((x) => ({ ...x, id: cliente.id }))
      onClienteSalvo?.(cliente)
      return cliente
    },
  }))

  const campo = (k, label, props = {}, req) => (
    <Field label={label} required={req} error={erros[k]} className={props.wrap}>
      {({ id, invalid }) => <Input id={id} invalid={invalid} value={f[k]} onChange={props.onChange || set(k)} {...props.input} />}
    </Field>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Busca */}
      <div className="flex flex-col gap-1">
        {f.id ? (
          <div className="flex items-center justify-between gap-4 rounded-md border border-brand bg-brand-soft px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand"><UserCheck className="h-4 w-4" aria-hidden /> Cliente já cadastrado · confira e atualize os dados se precisar</p>
            <Button variant="ghost" size="sm" icon={X} onClick={limpar}>Outro cliente</Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Buscar cliente cadastrado" className="pl-9" placeholder="Já é cliente? Busque por nome ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
            </div>
            {busca.trim().length >= 2 && (
              <ul className="overflow-hidden rounded-md border border-line bg-surface">
                {res.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => escolher(c)} className="flex w-full justify-between px-4 py-3 text-left hover:bg-brand-soft">
                      <span className="font-medium">{c.nome}</span>
                      <span className="num text-xs text-muted">{c.documento ? mascaraCPF(c.documento) : ''}</span>
                    </button>
                  </li>
                ))}
                {res.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nenhum cliente encontrado. Preencha a ficha abaixo para cadastrar.</li>}
              </ul>
            )}
          </>
        )}
      </div>

      {erro && <Alert>{erro}</Alert>}
      {avisoCpf && <Alert tone="ok">{avisoCpf}</Alert>}

      {/* Dados obrigatórios */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {campo('nome', 'Nome completo', { wrap: 'sm:col-span-2' }, true)}
        <Field label="CPF" required error={erros.documento} hint={buscandoCpf ? 'Procurando cadastro…' : undefined}>
          {({ id, invalid }) => (
            <div className="relative">
              <Input id={id} invalid={invalid} inputMode="numeric" placeholder="000.000.000-00" className="num pr-9" value={f.documento}
                onChange={(e) => {
                  const doc = mascaraCPF(e.target.value)
                  setF((x) => ({ ...x, documento: doc }))
                  if (soDigitos(doc).length === 11 && soDigitos(doc) !== soDigitos(f.documento)) reconhecerCpf(doc)
                }} />
              {buscandoCpf && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
            </div>
          )}
        </Field>
        {campo('celular', 'Celular / WhatsApp', { onChange: (e) => setF((x) => ({ ...x, celular: mascaraFone(e.target.value) })), input: { inputMode: 'tel', placeholder: '(15) 99999-9999', className: 'num' } }, true)}
        <Field label="Como chegou até a loja" required error={erros.origem}>
          {({ id, invalid }) => (
            <Select id={id} invalid={invalid} value={f.origem} onChange={set('origem')}>
              <option value="">Selecione</option>
              {ORIGENS.map((o) => <option key={o}>{o}</option>)}
            </Select>
          )}
        </Field>
        {campo('nascimento', 'Data de nascimento', { input: { type: 'date' } })}
      </div>

      {/* Endereço (obrigatório; o CEP preenche o resto) */}
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <p className="text-sm font-semibold text-muted">Endereço <span className="font-normal">· digite o CEP e o endereço é preenchido automaticamente</span></p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="CEP" required error={erros.cep} hint={buscandoCep ? 'Buscando endereço…' : undefined}>
            {({ id, invalid }) => (
              <div className="relative">
                <Input id={id} invalid={invalid} inputMode="numeric" className="num pr-9" value={f.cep} placeholder="00000-000"
                  onChange={(e) => {
                    const cep = mascaraCEP(e.target.value)
                    setF((x) => ({ ...x, cep }))
                    if (soDigitos(cep).length === 8 && soDigitos(cep) !== soDigitos(f.cep)) buscarCep(cep)
                  }} />
                {buscandoCep && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
              </div>
            )}
          </Field>
          {campo('logradouro', 'Rua / avenida', { wrap: 'sm:col-span-2', input: { ref: logradouroRef } }, true)}
          {campo('numero', 'Número', { input: { ref: numeroRef, inputMode: 'numeric' } }, true)}
          {campo('complemento', 'Complemento', { input: { placeholder: 'Apto, bloco, casa…' } })}
          {campo('bairro', 'Bairro', {}, true)}
          {campo('cidade', 'Cidade', {}, true)}
          <Field label="UF" required>
            {({ id }) => <Select id={id} value={f.uf} onChange={set('uf')}>{UFS.map((u) => <option key={u}>{u}</option>)}</Select>}
          </Field>
        </div>
        {avisoCep && <Alert tone="warn">{avisoCep}</Alert>}
      </div>
    </div>
  )
})

export default ClienteFicha
