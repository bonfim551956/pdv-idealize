import { useCallback, useEffect, useRef, useState } from 'react'
import { Receipt, FileText, FileDown, RefreshCw, Ban, ExternalLink, MessageCircle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { nfce, STATUS_NF } from '../../lib/nfce'
import { brl, dataHoraBR } from '../../lib/format'
import { Button, Section, Modal, Alert, Field, Input, Select, cx, useToast } from '../../components/ui'

const so = (v) => String(v ?? '').replace(/\D/g, '')
const docFmt = (d) => {
  const x = so(d)
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return d || ''
}
const ATIVAS = ['autorizado', 'processando', 'processando_autorizacao']
const PROCESSANDO = ['processando', 'processando_autorizacao']
const NOME_MODELO = { nfce: 'NFC-e', nfe: 'NF-e' }
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

/*
  Notas da venda, uma por cliente/CPF:
  - NFC-e (cupom fiscal): venda de balcão para pessoa física. Sai na hora.
  - NF-e (nota "grande", DANFE A4): quando o cliente pede nota no CNPJ da empresa, é de outro estado ou precisa do endereço na nota.
  Uma venda não pode sair nas duas: para trocar, cancele a primeira.
*/
export default function NotaFiscalVenda({ venda, porCliente }) {
  const toast = useToast()
  const [notas, setNotas] = useState([])
  const [ocupado, setOcupado] = useState(null)
  const [erro, setErro] = useState(null)
  const [cancelar, setCancelar] = useState(null)
  const [just, setJust] = useState('')
  const [nfeDe, setNfeDe] = useState(null)
  const timers = useRef(new Map()) // um acompanhamento por nota
  const vivo = useRef(true)
  const [fones, setFones] = useState({}) // celular de cada cliente, já carregado (o WhatsApp abre na hora do clique)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('notas_fiscais').select('*').eq('venda_id', venda.id).order('created_at')
    setNotas(data || [])
    return data || []
  }, [venda.id])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    vivo.current = true
    const t = timers.current
    return () => { vivo.current = false; t.forEach(clearTimeout); t.clear() }
  }, [])
  useEffect(() => {
    const ids = porCliente.map((c) => c.id)
    if (!ids.length) return
    supabase.from('cliente_contatos').select('cliente_id, valor, principal').in('cliente_id', ids).then(({ data }) => {
      const m = {}
      for (const c of data || []) if (!m[c.cliente_id] || c.principal) m[c.cliente_id] = c.valor
      setFones(m)
    })
  }, [porCliente.map((c) => c.id).join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const mensagemFalha = (n) => n?.status === 'denegado'
    ? `Nota denegada pela SEFAZ: ${n.mensagem || 'confira o cadastro do cliente e da loja.'}`
    : `Nota não autorizada: ${n?.mensagem || 'veja o detalhe na lista.'}`

  // NF-e é processada em fila: consulta de 4 em 4 segundos até sair o resultado (máx. ~1 min)
  const acompanhar = useCallback((nota, tentativa = 0) => {
    clearTimeout(timers.current.get(nota.id))
    if (tentativa >= 15 || !vivo.current) return
    timers.current.set(nota.id, setTimeout(async () => {
      if (!vivo.current) return
      try {
        const r = await nfce({ acao: 'consultar', nota_id: nota.id })
        if (!vivo.current) return
        await carregar()
        const st = r?.nota?.status
        if (PROCESSANDO.includes(st)) acompanhar(nota, tentativa + 1)
        else if (st === 'autorizado') toast(`${NOME_MODELO[nota.modelo]} autorizada`)
        else setErro(mensagemFalha(r?.nota))
      } catch { if (vivo.current) acompanhar(nota, tentativa + 1) }
    }, 4000))
  }, [carregar, toast]) // eslint-disable-line react-hooks/exhaustive-deps

  const rodar = async (chave, body, ok) => {
    setOcupado(chave); setErro(null)
    try {
      const r = await nfce(body)
      const n = r?.nota
      if (n && PROCESSANDO.includes(n.status)) { toast('Nota enviada; aguardando a SEFAZ…'); acompanhar(n) }
      else if (n?.status === 'autorizado' || n?.status === 'cancelado') { if (ok) toast(ok) }
      else setErro(n ? mensagemFalha(n) : 'Não foi possível registrar a resposta da nota. Clique em Atualizar.')
      await carregar()
      return r
    } catch (e) {
      setErro(e.message)
    } finally { setOcupado(null) }
  }

  const confirmarCancelamento = async () => {
    const r = await rodar(`c-${cancelar.id}`, { acao: 'cancelar', nota_id: cancelar.id, justificativa: just.trim() })
    if (r?.nota?.status === 'cancelado') { toast('Nota cancelada'); setCancelar(null); setJust('') }
  }

  // Abre o WhatsApp do cliente com o link da nota
  const enviarWhats = (n) => {
    const cli = porCliente.find((c) => c.id === n.cliente_id)
    let fone = so(fones[n.cliente_id])
    if (fone.length === 10 || fone.length === 11) fone = `55${fone}`
    const primeiro = (cli?.nome || '').split(' ')[0]
    const nomeCap = primeiro ? primeiro[0] + primeiro.slice(1).toLowerCase() : ''
    const linhas = [
      `Olá${nomeCap ? `, ${nomeCap}` : ''}! Aqui está a nota fiscal da sua compra na Óticas Idealize (${NOME_MODELO[n.modelo] || 'NFC-e'} ${n.numero || ''}).`.replace(' )', ')'),
      n.danfe_url && `Nota: ${n.danfe_url}`,
      n.consulta_url && `Consulta na SEFAZ: ${n.consulta_url}`,
      n.chave && `Chave de acesso: ${n.chave}`,
    ].filter(Boolean)
    const url = `https://wa.me/${fone.length >= 12 ? fone : ''}?text=${encodeURIComponent(linhas.join('\n'))}`
    if (fone.length < 12) toast('Cliente sem celular cadastrado: escolha o contato no WhatsApp.', 'erro')
    window.open(url, '_blank', 'noopener')
  }

  const clientes = porCliente.filter((c) => c.total > 0)
  const ativaDe = (cid) => notas.find((n) => n.cliente_id === cid && ATIVAS.includes(n.status))

  return (
    <Section title="Nota fiscal" aside={<span className="text-xs text-muted">uma nota por CPF</span>}>
      <div className="flex flex-col gap-4">
        {erro && <Alert>{erro}</Alert>}

        {venda.status === 'confirmada' && (
          <ul className="flex flex-col divide-y divide-line">
            {clientes.map((c) => {
              const ativa = ativaDe(c.id)
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="text-sm">
                    <span className="font-medium">{c.nome}</span>
                    <span className="block text-xs text-muted">{c.documento ? `CPF ${docFmt(c.documento)}` : 'sem CPF'} · produtos {brl(c.total)}</span>
                  </span>
                  {ativa ? (
                    <span className="text-xs font-semibold text-ok">{NOME_MODELO[ativa.modelo] || 'Nota'} {PROCESSANDO.includes(ativa.status) ? 'em processamento' : 'emitida'}</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" icon={Receipt} loading={ocupado === `e-${c.id}`} disabled={!!ocupado}
                        onClick={() => rodar(`e-${c.id}`, { acao: 'emitir', modelo: 'nfce', venda_id: venda.id, cliente_id: c.id }, 'Cupom fiscal autorizado')}>
                        Cupom (NFC-e)
                      </Button>
                      <Button size="sm" variant="secondary" icon={FileText} disabled={!!ocupado} onClick={() => { setErro(null); setNfeDe(c) }}>NF-e</Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {venda.status !== 'confirmada' && notas.length === 0 && <p className="text-sm text-muted">Só venda confirmada emite nota.</p>}

        {notas.length > 0 && (
          <ul className="flex flex-col gap-2">
            {[...notas].reverse().map((n) => {
              const st = STATUS_NF[n.status] || { rotulo: n.status, tom: 'bg-line/60' }
              const cli = porCliente.find((c) => c.id === n.cliente_id)
              const dest = n.destinatario
              return (
                <li key={n.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className={cx('flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold', st.tom)}>
                        {PROCESSANDO.includes(n.status) && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}{st.rotulo}
                      </span>
                      <span className="font-medium">{NOME_MODELO[n.modelo] || 'NFC-e'}{n.numero ? ` ${n.numero}${n.serie ? `/${n.serie}` : ''}` : ''}</span>
                      {n.ambiente === 'homologacao' && <span className="rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent-dark">teste</span>}
                    </span>
                    <span className="num font-semibold">{brl(n.valor)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {n.modelo === 'nfe' && dest?.documento && so(dest.documento) !== so(cli?.documento) ? `${dest.nome} · ${docFmt(dest.documento)}` : cli?.nome || ''}
                    {' · '}{dataHoraBR(n.created_at)}{n.cancelada_em ? ` · cancelada em ${dataHoraBR(n.cancelada_em)}` : ''}
                  </p>
                  {n.mensagem && !['autorizado', 'cancelado'].includes(n.status) && !PROCESSANDO.includes(n.status) && <p className="mt-1 text-xs text-danger">{n.mensagem}</p>}
                  {n.chave && <p className="num mt-1 break-all text-xs text-muted">Chave {n.chave}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {n.danfe_url && <a href={n.danfe_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-brand hover:text-brand"><FileDown className="h-3.5 w-3.5" />{n.modelo === 'nfe' ? 'DANFE (PDF)' : 'Cupom (DANFE)'}</a>}
                    {n.xml_url && <a href={n.xml_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-brand hover:text-brand"><FileDown className="h-3.5 w-3.5" />XML</a>}
                    {n.consulta_url && <a href={n.consulta_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-brand hover:text-brand"><ExternalLink className="h-3.5 w-3.5" />Consulta SEFAZ</a>}
                    {n.status === 'autorizado' && (
                      <Button size="sm" variant="ghost" icon={MessageCircle} onClick={() => enviarWhats(n)}>WhatsApp</Button>
                    )}
                    {!['cancelado', 'erro_autorizacao'].includes(n.status) && (
                      <Button size="sm" variant="ghost" icon={RefreshCw} loading={ocupado === `q-${n.id}`} disabled={!!ocupado}
                        onClick={() => rodar(`q-${n.id}`, { acao: 'consultar', nota_id: n.id }, 'Situação atualizada')}>Atualizar</Button>
                    )}
                    {n.status === 'autorizado' && (
                      <Button size="sm" variant="ghost" icon={Ban} disabled={!!ocupado} onClick={() => setCancelar(n)}>Cancelar nota</Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <NFeModal cliente={nfeDe} onClose={() => { setNfeDe(null); setErro(null) }} enviando={!!ocupado} erro={erro}
        onEmitir={async (destinatario) => {
          const r = await rodar(`n-${nfeDe.id}`, { acao: 'emitir', modelo: 'nfe', venda_id: venda.id, cliente_id: nfeDe.id, destinatario }, 'NF-e autorizada')
          if (r?.nota && r.nota.status !== 'erro_autorizacao') setNfeDe(null)
        }} />

      <Modal open={!!cancelar} onOpenChange={(v) => { if (!v) { setCancelar(null); setJust(''); setErro(null) } }} title="Cancelar nota fiscal?">
        <div className="flex flex-col gap-4">
          {erro && <Alert>{erro}</Alert>}
          <p className="text-sm">{cancelar?.modelo === 'nfe'
            ? 'A NF-e pode ser cancelada em até 24 horas depois da autorização, se a mercadoria ainda não saiu.'
            : 'A SEFAZ só aceita cancelamento de NFC-e em até 30 minutos depois da autorização.'} Depois disso, fale com o contador.</p>
          <label className="flex flex-col gap-1 text-sm font-medium text-muted">Justificativa * <span className="text-xs font-normal">mínimo 15 caracteres ({just.trim().length}/15)</span>
            <textarea className="min-h-20 rounded-md border border-line bg-surface p-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              value={just} maxLength={255} onChange={(e) => setJust(e.target.value)} placeholder="Ex.: nota emitida com valor errado" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCancelar(null); setJust('') }}>Voltar</Button>
            <Button variant="danger" loading={!!ocupado} disabled={just.trim().length < 15} onClick={confirmarCancelamento}>Cancelar nota</Button>
          </div>
        </div>
      </Modal>
    </Section>
  )
}

/* ---------- NF-e: escolher destinatário ---------- */
const vazio = { documento: '', nome: '', indicador_ie: '9', ie: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'SP' }

function NFeModal({ cliente, onClose, onEmitir, enviando, erro }) {
  const [modo, setModo] = useState('cliente')
  const [end, setEnd] = useState(null)
  const [d, setD] = useState(vazio)
  const [erros, setErros] = useState({})
  const [buscandoCep, setBuscandoCep] = useState(false)

  useEffect(() => {
    if (!cliente) return
    setModo('cliente'); setD(vazio); setErros({}); setEnd(null)
    supabase.from('cliente_enderecos').select('cep, logradouro, numero, complemento, bairro, cidade, uf').eq('cliente_id', cliente.id).limit(1).maybeSingle()
      .then(({ data }) => setEnd(data || {}))
  }, [cliente])

  const set = (k) => (e) => { setD((x) => ({ ...x, [k]: e.target.value })); setErros((x) => ({ ...x, [k]: undefined })) }
  const endCompleto = end && end.cep && end.logradouro && end.numero && end.bairro && end.cidade && end.uf
  const cpfCliente = so(cliente?.documento).length === 11

  const buscarCep = async (v) => {
    const cep = so(v)
    if (cep.length !== 8) return
    setBuscandoCep(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json())
      if (!r.erro) setD((x) => ({ ...x, logradouro: r.logradouro || x.logradouro, bairro: r.bairro || x.bairro, cidade: r.localidade || x.cidade, uf: r.uf || x.uf }))
    } catch { /* preenche à mão */ }
    setBuscandoCep(false)
  }

  const emitir = () => {
    if (modo === 'cliente') { onEmitir(null); return }
    const e = {}
    const doc = so(d.documento)
    if (![11, 14].includes(doc.length)) e.documento = 'CPF (11) ou CNPJ (14 dígitos)'
    if (!d.nome.trim()) e.nome = 'Obrigatório'
    if (d.indicador_ie === '1' && !so(d.ie)) e.ie = 'Obrigatória para contribuinte'
    for (const k of ['logradouro', 'numero', 'bairro', 'cidade']) if (!String(d[k]).trim()) e[k] = 'Obrigatório'
    if (so(d.cep).length !== 8) e.cep = 'CEP com 8 dígitos'
    setErros(e)
    if (Object.keys(e).length) return
    onEmitir({ ...d, documento: doc, indicador_ie: Number(d.indicador_ie) })
  }

  const opcao = (v, titulo, sub) => (
    <button type="button" onClick={() => setModo(v)}
      className={cx('flex-1 rounded-lg border p-3 text-left transition-colors', modo === v ? 'border-brand bg-brand-soft' : 'border-line hover:border-muted')}>
      <span className={cx('block text-sm font-semibold', modo === v ? 'text-brand' : 'text-ink')}>{titulo}</span>
      <span className="block text-xs text-muted">{sub}</span>
    </button>
  )

  return (
    <Modal open={!!cliente} onOpenChange={(v) => !v && onClose()} title="Emitir NF-e" wide>
      {cliente && (
        <div className="flex flex-col gap-4">
          {erro && <Alert>{erro}</Alert>}
          <div className="flex flex-col gap-2 sm:flex-row">
            {opcao('cliente', 'No CPF do cliente', `${cliente.nome}${cpfCliente ? ` · ${docFmt(cliente.documento)}` : ''}`)}
            {opcao('outro', 'Em outro CPF ou CNPJ', 'Ex.: nota no CNPJ da empresa do cliente')}
          </div>

          {modo === 'cliente' ? (
            end === null ? <p className="text-sm text-muted">Carregando endereço…</p>
              : !cpfCliente ? <Alert>Cliente sem CPF. Use "Em outro CPF ou CNPJ".</Alert>
              : !endCompleto ? <Alert>Endereço do cliente incompleto. A NF-e exige CEP, rua, número, bairro e cidade: complete a ficha do cliente ou use "Em outro CPF ou CNPJ".</Alert>
              : <p className="rounded-md bg-bg p-3 text-sm">{end.logradouro}, {end.numero}{end.complemento ? ` - ${end.complemento}` : ''} · {end.bairro} · {end.cidade}/{end.uf} · CEP {end.cep}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="CPF ou CNPJ" required error={erros.documento} className="sm:col-span-2">
                {({ id, invalid }) => <Input id={id} invalid={invalid} inputMode="numeric" className="num" value={d.documento} onChange={set('documento')} />}
              </Field>
              <Field label="Nome / razão social" required error={erros.nome} className="sm:col-span-2">
                {({ id, invalid }) => <Input id={id} invalid={invalid} value={d.nome} onChange={set('nome')} />}
              </Field>
              <Field label="Inscrição estadual" className="sm:col-span-2">
                {({ id }) => (
                  <Select id={id} value={d.indicador_ie} onChange={set('indicador_ie')}>
                    <option value="9">Não contribuinte (pessoa física ou empresa sem IE)</option>
                    <option value="1">Contribuinte do ICMS (tem IE)</option>
                    <option value="2">Contribuinte isento de IE</option>
                  </Select>
                )}
              </Field>
              {d.indicador_ie === '1' ? (
                <Field label="Número da IE" required error={erros.ie} className="sm:col-span-2">
                  {({ id, invalid }) => <Input id={id} invalid={invalid} inputMode="numeric" className="num" value={d.ie} onChange={set('ie')} />}
                </Field>
              ) : <div className="hidden sm:col-span-2 sm:block" />}
              <Field label="CEP" required error={erros.cep} hint={buscandoCep ? 'Buscando endereço…' : undefined}>
                {({ id, invalid }) => <Input id={id} invalid={invalid} inputMode="numeric" className="num" value={d.cep}
                  onChange={(e) => { set('cep')(e); buscarCep(e.target.value) }} />}
              </Field>
              <Field label="Rua / avenida" required error={erros.logradouro} className="sm:col-span-2">
                {({ id, invalid }) => <Input id={id} invalid={invalid} value={d.logradouro} onChange={set('logradouro')} />}
              </Field>
              <Field label="Número" required error={erros.numero}>
                {({ id, invalid }) => <Input id={id} invalid={invalid} value={d.numero} onChange={set('numero')} />}
              </Field>
              <Field label="Complemento">{({ id }) => <Input id={id} value={d.complemento} onChange={set('complemento')} />}</Field>
              <Field label="Bairro" required error={erros.bairro}>
                {({ id, invalid }) => <Input id={id} invalid={invalid} value={d.bairro} onChange={set('bairro')} />}
              </Field>
              <Field label="Cidade" required error={erros.cidade}>
                {({ id, invalid }) => <Input id={id} invalid={invalid} value={d.cidade} onChange={set('cidade')} />}
              </Field>
              <Field label="UF">
                {({ id }) => <Select id={id} value={d.uf} onChange={set('uf')}>{UFS.map((u) => <option key={u}>{u}</option>)}</Select>}
              </Field>
            </div>
          )}

          <p className="text-xs text-muted">A NF-e vai para a fila da SEFAZ e costuma ser autorizada em alguns segundos; a tela atualiza sozinha. Fora de SP, a nota sai como venda interestadual.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Voltar</Button>
            <Button icon={FileText} loading={enviando} disabled={modo === 'cliente' && (!cpfCliente || !endCompleto)} onClick={emitir}>Emitir NF-e</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
