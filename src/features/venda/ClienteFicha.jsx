import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
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

  const limpar = () => { setF({ ...vazio }); setErros({}); setErro(null) }

  // CEP preenche o endereço automaticamente (ViaCEP)
  const buscarCep = async () => {
    const cep = soDigitos(f.cep)
    if (cep.length !== 8) return
    setBuscandoCep(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json())
      if (!r.erro) setF((x) => ({ ...x, logradouro: r.logradouro || x.logradouro, bairro: r.bairro || x.bairro, cidade: r.localidade || x.cidade, uf: r.uf || x.uf }))
      else setErros((e) => ({ ...e, cep: 'CEP não encontrado' }))
    } catch { /* sem internet: segue manual */ }
    setBuscandoCep(false)
  }

  const validar = () => {
    const e = {}
    if (f.nome.trim().split(/\s+/).length < 2) e.nome = 'Informe nome e sobrenome'
    if (!soDigitos(f.documento)) e.documento = 'Obrigatório'
    else if (!cpfValido(f.documento)) e.documento = 'CPF inválido'
    if (soDigitos(f.celular).length < 10) e.celular = 'Celular com DDD'
    if (!f.origem) e.origem = 'Obrigatório'
    const temEndereco = [f.cep, f.logradouro, f.numero, f.bairro, f.cidade].some((v) => v.trim())
    if (temEndereco) {
      if (soDigitos(f.cep).length !== 8) e.cep = 'CEP com 8 dígitos'
      if (!f.logradouro.trim()) e.logradouro = 'Obrigatório'
      if (!f.numero.trim()) e.numero = 'Obrigatório'
      if (!f.bairro.trim()) e.bairro = 'Obrigatório'
      if (!f.cidade.trim()) e.cidade = 'Obrigatório'
    }
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
      // endereço (opcional)
      if (f.logradouro.trim()) {
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

      {/* Dados obrigatórios */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {campo('nome', 'Nome completo', { wrap: 'sm:col-span-2' }, true)}
        {campo('documento', 'CPF', { onChange: (e) => setF((x) => ({ ...x, documento: mascaraCPF(e.target.value) })), input: { inputMode: 'numeric', placeholder: '000.000.000-00', className: 'num' } }, true)}
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

      {/* Endereço */}
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <p className="text-sm font-semibold text-muted">Endereço <span className="font-normal">(opcional · o CEP preenche o resto)</span></p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="CEP" error={erros.cep}>
            {({ id, invalid }) => (
              <div className="relative">
                <Input id={id} invalid={invalid} inputMode="numeric" className="num" value={f.cep} placeholder="00000-000"
                  onChange={(e) => setF((x) => ({ ...x, cep: mascaraCEP(e.target.value) }))} onBlur={buscarCep} />
                {buscandoCep && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" aria-label="Buscando CEP" />}
              </div>
            )}
          </Field>
          {campo('logradouro', 'Rua / avenida', { wrap: 'sm:col-span-2' })}
          {campo('numero', 'Número')}
          {campo('complemento', 'Complemento')}
          {campo('bairro', 'Bairro')}
          {campo('cidade', 'Cidade')}
          <Field label="UF">
            {({ id }) => <Select id={id} value={f.uf} onChange={set('uf')}>{UFS.map((u) => <option key={u}>{u}</option>)}</Select>}
          </Field>
        </div>
      </div>
    </div>
  )
})

export default ClienteFicha
