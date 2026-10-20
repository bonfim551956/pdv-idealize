import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, Info, Save, FolderDown, FileDown, FileSpreadsheet } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { nfce } from '../lib/nfce'
import { Field, Input, Select, Section, Spinner, Alert, Button, useToast } from '../components/ui'

/*
  Configuração da NFC-e por loja (Focus NFe). Só supervisão e diretoria.
  Os tokens são gravados pela função nfce e nunca voltam para a tela: aqui só aparece se existe ou não.
*/
const nomeLoja = (n) => (n || '').replace('Óticas Idealize ', '')
const Tem = ({ ok, children }) => (
  <span className={ok ? 'flex items-center gap-1 text-ok' : 'flex items-center gap-1 text-muted'}>
    {ok ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}{children}
  </span>
)

function Loja({ l, onSalvo }) {
  const toast = useToast()
  const [f, setF] = useState({
    inscricao_estadual: l.inscricao_estadual || '', regime: l.regime || 'simples', csosn: l.csosn || '102',
    ambiente: l.ambiente || 'homologacao', token_homologacao: '', token_producao: '',
  })
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const producaoSemToken = f.ambiente === 'producao' && !l.tem_token_producao && !f.token_producao.trim()

  const salvar = async () => {
    setSalvando(true)
    try {
      await nfce({ acao: 'configurar', loja_id: l.loja_id, ...f })
      toast(`${nomeLoja(l.loja)}: configuração salva`)
      setF((x) => ({ ...x, token_homologacao: '', token_producao: '' }))
      onSalvo()
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }

  return (
    <Section title={nomeLoja(l.loja)} aside={<span className="text-xs text-muted">{l.cnpj ? `CNPJ ${l.cnpj}` : 'sem CNPJ cadastrado'}</span>}>
      <div className="flex flex-col gap-4">
        {!l.cnpj && <Alert tone="warn">Esta loja está sem CNPJ no sistema; a nota não sai até cadastrar.</Alert>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Inscrição estadual">{({ id }) => <Input id={id} value={f.inscricao_estadual} onChange={set('inscricao_estadual')} />}</Field>
          <Field label="Regime">{({ id }) => (
            <Select id={id} value={f.regime} onChange={set('regime')}>
              <option value="simples">Simples Nacional</option><option value="normal">Regime normal</option>
            </Select>)}</Field>
          <Field label="CSOSN / CST ICMS" hint="Simples: 102 (confirme com o contador)">{({ id }) => <Input id={id} value={f.csosn} onChange={set('csosn')} />}</Field>
          <Field label="Ambiente">{({ id }) => (
            <Select id={id} value={f.ambiente} onChange={set('ambiente')}>
              <option value="homologacao">Homologação (teste, sem valor fiscal)</option><option value="producao">Produção (nota de verdade)</option>
            </Select>)}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Token Focus NFe · homologação" hint={l.tem_token_homologacao ? 'Já cadastrado. Preencha só para trocar.' : 'Painel da Focus > Empresas > Tokens'}>
            {({ id }) => <Input id={id} type="password" autoComplete="off" value={f.token_homologacao} onChange={set('token_homologacao')} placeholder={l.tem_token_homologacao ? '••••••••' : ''} />}
          </Field>
          <Field label="Token Focus NFe · produção" hint={l.tem_token_producao ? 'Já cadastrado. Preencha só para trocar.' : 'Só depois de testar em homologação'}>
            {({ id }) => <Input id={id} type="password" autoComplete="off" value={f.token_producao} onChange={set('token_producao')} placeholder={l.tem_token_producao ? '••••••••' : ''} />}
          </Field>
        </div>
        {producaoSemToken && <Alert tone="warn">Para emitir em produção, cadastre o token de produção.</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap gap-4"><Tem ok={l.tem_token_homologacao}>Token de teste</Tem><Tem ok={l.tem_token_producao}>Token de produção</Tem></div>
          <Button icon={Save} loading={salvando} disabled={producaoSemToken} onClick={salvar}>Salvar</Button>
        </div>
      </div>
    </Section>
  )
}

export default function NotaFiscal() {
  const [lojas, setLojas] = useState(null)
  const [erro, setErro] = useState(null)
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('situacao_fiscal')
    if (error) { setErro(mensagemErro(error)); setLojas([]); return }
    setLojas(data || [])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Nota fiscal</h1>
        <p className="mt-1 text-sm text-muted">NFC-e pela Focus NFe, uma configuração por loja (CNPJ).</p>
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Antes: cadastre cada CNPJ no painel da Focus NFe com o certificado digital A1 e o CSC (código do contribuinte da SEFAZ-SP). Comece em homologação, emita uma nota de teste numa venda e só depois passe para produção. NCM, CFOP, CSOSN e PIS/COFINS devem ser conferidos com o contador.</span>
      </p>
      {erro && <Alert>{erro}</Alert>}
      {lojas && lojas.length > 0 && <Contabilidade lojas={lojas} />}
      {!lojas ? <Spinner /> : lojas.map((l) => <Loja key={`${l.loja_id}-${l.tem_token_homologacao}-${l.tem_token_producao}-${l.ambiente}`} l={l} onSalvo={carregar} />)}
    </div>
  )
}

/* ---------- Arquivos para a contabilidade ----------
   - ZIP mensal dos XMLs (NF-e e NFC-e) e das DANFEs, gerado pela Focus (backup oficial)
   - Planilha (CSV) das notas do mês emitidas pelo PDV, para conferência */
const mesTxt = (m) => `${m.slice(4, 6)}/${m.slice(0, 4)}`
const isoMes = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function Contabilidade({ lojas }) {
  const [loja, setLoja] = useState(lojas[0].loja_id)
  const [backups, setBackups] = useState(null)
  const [erro, setErro] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [mes, setMes] = useState(isoMes())
  const [gerando, setGerando] = useState(false)

  const buscar = async () => {
    setBuscando(true); setErro(null); setBackups(null)
    try { setBackups(await nfce({ acao: 'backups', loja_id: loja })) } catch (e) { setErro(e.message) }
    setBuscando(false)
  }
  useEffect(() => { setBackups(null); setErro(null) }, [loja])

  const planilha = async () => {
    setGerando(true); setErro(null)
    const ini = `${mes}-01T00:00:00-03:00`
    const [a, m] = mes.split('-').map(Number)
    const fim = new Date(a, m, 1).toISOString()
    const { data, error } = await supabase.from('notas_fiscais')
      .select('created_at, modelo, numero, serie, chave, status, valor, ambiente, destinatario, cancelada_em, venda:vendas(numero), cliente:clientes(nome, documento)')
      .eq('loja_id', loja).gte('created_at', ini).lt('created_at', fim).in('status', ['autorizado', 'cancelado']).order('created_at')
    setGerando(false)
    if (error) { setErro(mensagemErro(error)); return }
    const linhas = [['Data', 'Modelo', 'Número', 'Série', 'Chave de acesso', 'Situação', 'Valor', 'Destinatário', 'CPF/CNPJ', 'Venda', 'Ambiente']]
    for (const n of data) {
      const d = n.destinatario || {}
      linhas.push([
        new Date(n.created_at).toLocaleString('pt-BR'), n.modelo === 'nfe' ? 'NF-e' : 'NFC-e', n.numero || '', n.serie || '', n.chave ? `'${n.chave}` : '',
        n.status === 'cancelado' ? 'Cancelada' : 'Autorizada', String(n.valor).replace('.', ','),
        d.nome || n.cliente?.nome || '', d.documento || n.cliente?.documento || '', n.venda?.numero || '', n.ambiente === 'producao' ? 'Produção' : 'Teste',
      ])
    }
    const csv = '\ufeff' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const el = document.createElement('a')
    const nomeLj = nomeLoja(lojas.find((l) => l.loja_id === loja)?.loja).toLowerCase().replace(/\s+/g, '-')
    el.href = url; el.download = `notas-${nomeLj}-${mes}.csv`; el.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Section title="Arquivos para a contabilidade">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Loja" className="w-56">
            {({ id }) => (
              <Select id={id} value={loja} onChange={(e) => setLoja(e.target.value)}>
                {lojas.map((l) => <option key={l.loja_id} value={l.loja_id}>{nomeLoja(l.loja)}</option>)}
              </Select>
            )}
          </Field>
          <Button variant="secondary" icon={FolderDown} loading={buscando} onClick={buscar}>Ver XMLs por mês (ZIP)</Button>
          <Field label="Mês da planilha" className="w-44">
            {({ id }) => <Input id={id} type="month" max={isoMes()} value={mes} onChange={(e) => setMes(e.target.value)} />}
          </Field>
          <Button variant="secondary" icon={FileSpreadsheet} loading={gerando} onClick={planilha}>Planilha das notas (CSV)</Button>
        </div>
        {erro && <Alert>{erro}</Alert>}
        {backups && (backups.meses.length === 0 ? (
          <p className="text-sm text-muted">Ainda não há backup mensal para esta loja{backups.ambiente === 'homologacao' ? ' (só há token de teste; os backups saem das notas de produção)' : ''}. A Focus gera o arquivo do mês depois que ele fecha.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {backups.meses.map((b) => (
              <li key={b.mes} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="num font-semibold">{mesTxt(b.mes)}</span>
                <span className="flex gap-2">
                  {b.xmls && <a href={b.xmls} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-brand hover:text-brand"><FileDown className="h-3.5 w-3.5" />XMLs (ZIP)</a>}
                  {b.danfes && <a href={b.danfes} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-brand hover:text-brand"><FileDown className="h-3.5 w-3.5" />DANFEs NF-e (ZIP)</a>}
                </span>
              </li>
            ))}
          </ul>
        ))}
        <p className="text-xs text-muted">Mande à contabilidade o ZIP de XMLs de cada mês (é o arquivo que eles importam) e, se quiserem conferir, a planilha das notas.</p>
      </div>
    </Section>
  )
}
