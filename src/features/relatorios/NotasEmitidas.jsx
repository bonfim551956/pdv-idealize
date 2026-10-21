import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, FileSpreadsheet, FolderDown, FileDown } from 'lucide-react'
import { nfce } from '../../lib/nfce'
import { supabase, buscarTodos, mensagemErro } from '../../lib/supabase'
import { brl, dataHoraBR, dataBR } from '../../lib/format'
import { Button, Chips, Spinner, Alert, Empty, Section, cx } from '../../components/ui'
import { Kpi, nomeLoja } from './partes'

/*
  Relatório de notas fiscais emitidas no período (NFC-e = cupom fiscal e NF-e), para conferência e impressão.
  Administrativo vê a própria loja; Supervisão e Diretor, todas (o banco garante).
  Por padrão só notas de produção: as de homologação (teste) não têm valor fiscal.
*/
const MODELOS = [
  { value: 'todos', label: 'Todas' },
  { value: 'nfce', label: 'Cupom (NFC-e)' },
  { value: 'nfe', label: 'NF-e' },
]
const SITUACOES = [
  { value: 'todas', label: 'Autorizadas e canceladas' },
  { value: 'autorizado', label: 'Só autorizadas' },
  { value: 'cancelado', label: 'Só canceladas' },
]
const nomeModelo = (m) => (m === 'nfe' ? 'NF-e' : 'NFC-e')
const docTxt = (d) => {
  const s = String(d || '').replace(/\D/g, '')
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return s || '—'
}

/* ZIP mensal oficial da Focus (XMLs e DANFEs) para mandar à contabilidade */
const mesTxt = (m) => `${String(m).slice(4, 6)}/${String(m).slice(0, 4)}`
function ArquivosContabilidade({ lojaId }) {
  const [backups, setBackups] = useState(null)
  const [erro, setErro] = useState(null)
  const [buscando, setBuscando] = useState(false)
  useEffect(() => { setBackups(null); setErro(null) }, [lojaId])
  const buscar = async () => {
    setBuscando(true); setErro(null); setBackups(null)
    try { setBackups(await nfce({ acao: 'backups', loja_id: lojaId })) } catch (e) { setErro(e.message) }
    setBuscando(false)
  }
  const link = 'inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:border-brand hover:text-brand'
  return (
    <Section title="Arquivos para a contabilidade" className="no-print">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon={FolderDown} loading={buscando} disabled={!lojaId} onClick={buscar}>Ver XMLs por mês (ZIP)</Button>
          {!lojaId && <span className="text-sm text-muted">Escolha uma loja no filtro acima para baixar os XMLs.</span>}
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
                  {b.xmls && <a href={b.xmls} target="_blank" rel="noreferrer" className={link}><FileDown className="h-3.5 w-3.5" />XMLs (ZIP)</a>}
                  {b.danfes && <a href={b.danfes} target="_blank" rel="noreferrer" className={link}><FileDown className="h-3.5 w-3.5" />DANFEs NF-e (ZIP)</a>}
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

export default function NotasEmitidas({ ini, fim, loja, lojaZip, isAdmin, rotuloLoja }) {
  const [modelo, setModelo] = useState('todos')
  const [situacao, setSituacao] = useState('todas')
  const [teste, setTeste] = useState(false)
  const [notas, setNotas] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let ativo = true
    setNotas(null); setErro(null)
    buscarTodos(() => {
      let q = supabase.from('notas_fiscais')
        .select('id, created_at, modelo, numero, serie, chave, status, valor, ambiente, destinatario, cancelada_em, motivo_cancelamento, venda_id, venda:vendas(numero), cliente:clientes(nome, documento), loja:lojas(nome)')
        .gte('created_at', ini.toISOString()).lt('created_at', fim.toISOString())
        .in('status', situacao === 'todas' ? ['autorizado', 'cancelado'] : [situacao])
        .order('created_at').order('id')
      if (loja) q = q.eq('loja_id', loja)
      if (modelo !== 'todos') q = q.eq('modelo', modelo)
      if (!teste) q = q.eq('ambiente', 'producao')
      return q
    }).then(({ data, error }) => {
      if (!ativo) return
      if (error) { setErro(mensagemErro(error)); setNotas([]); return }
      setNotas(data || [])
    })
    return () => { ativo = false }
  }, [ini, fim, loja, modelo, situacao, teste])

  const resumo = useMemo(() => {
    const r = { aut: 0, autValor: 0, canc: 0, cancValor: 0, nfce: 0, nfe: 0 }
    for (const n of notas || []) {
      if (n.status === 'autorizado') { r.aut++; r.autValor += Number(n.valor) } else { r.canc++; r.cancValor += Number(n.valor) }
      if (n.status === 'autorizado') r[n.modelo === 'nfe' ? 'nfe' : 'nfce']++
    }
    return r
  }, [notas])

  const linhaDe = (n) => {
    const d = n.destinatario || {}
    return { nome: d.nome || n.cliente?.nome || 'Consumidor não identificado', doc: d.documento || n.cliente?.documento || '' }
  }

  const planilha = () => {
    const linhas = [['Data', 'Loja', 'Modelo', 'Número', 'Série', 'Situação', 'Valor', 'Destinatário', 'CPF/CNPJ', 'Venda', 'Chave de acesso', 'Ambiente']]
    for (const n of notas) {
      const { nome, doc } = linhaDe(n)
      linhas.push([new Date(n.created_at).toLocaleString('pt-BR'), nomeLoja(n.loja?.nome), nomeModelo(n.modelo), n.numero || '', n.serie || '',
        n.status === 'cancelado' ? 'Cancelada' : 'Autorizada', String(n.valor).replace('.', ','), nome, doc, n.venda?.numero || '',
        n.chave ? `'${n.chave}` : '', n.ambiente === 'producao' ? 'Produção' : 'Teste'])
    }
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const el = document.createElement('a')
    el.href = url; el.download = `notas-fiscais-${dataBR(ini).replace(/\//g, '-')}-a-${dataBR(new Date(fim - 1)).replace(/\//g, '-')}.csv`; el.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const periodoTxt = `${dataBR(ini)} a ${dataBR(new Date(fim.getTime() - 1))}`

  return (
    <div className="relatorio-impressao flex flex-col gap-6">
      <div className="no-print flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
        <Chips label="Modelo" options={MODELOS} value={modelo} onChange={(v) => v && setModelo(v)} />
        <Chips label="Situação" options={SITUACOES} value={situacao} onChange={(v) => v && setSituacao(v)} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={teste} onChange={(e) => setTeste(e.target.checked)} />
            Incluir notas de teste (homologação)
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" icon={FileSpreadsheet} disabled={!notas?.length} onClick={planilha}>Planilha (CSV)</Button>
            <Button icon={Printer} disabled={!notas?.length} onClick={() => window.print()}>Imprimir</Button>
          </div>
        </div>
      </div>

      {/* cabeçalho que só sai no papel */}
      <div className="hidden print:block">
        <p className="font-display text-xl font-bold">Notas fiscais emitidas</p>
        <p className="text-sm">{rotuloLoja} · {periodoTxt} · {MODELOS.find((m) => m.value === modelo).label} · {SITUACOES.find((s) => s.value === situacao).label}{teste ? ' · inclui notas de teste' : ''}</p>
        <p className="text-xs text-muted">Impresso em {dataHoraBR(new Date())}</p>
      </div>

      {erro && <Alert>{erro}</Alert>}
      {notas === null ? <Spinner label="Buscando notas" /> : notas.length === 0 ? (
        <Empty title="Nenhuma nota no período">{teste ? 'Não há notas com esses filtros.' : 'Não há notas de produção com esses filtros. Marque "Incluir notas de teste" para ver as de homologação.'}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi rotulo="Notas autorizadas" valor={resumo.aut} sub={`${resumo.nfce} NFC-e · ${resumo.nfe} NF-e`} />
            <Kpi rotulo="Valor autorizado" valor={brl(resumo.autValor)} />
            <Kpi rotulo="Canceladas" valor={resumo.canc} cor={resumo.canc ? 'text-danger' : undefined} />
            <Kpi rotulo="Valor cancelado" valor={brl(resumo.cancValor)} cor={resumo.canc ? 'text-danger' : undefined} />
          </div>
          <Section title={`${notas.length} nota${notas.length === 1 ? '' : 's'} · ${periodoTxt}`}>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-[760px] text-left text-sm print:min-w-0 print:text-[11px]">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Data</th>
                    {isAdmin && <th className="py-2 pr-3 font-medium">Loja</th>}
                    <th className="py-2 pr-3 font-medium">Nota</th>
                    <th className="py-2 pr-3 font-medium">Destinatário</th>
                    <th className="py-2 pr-3 font-medium">Venda</th>
                    <th className="py-2 pr-3 text-right font-medium">Valor</th>
                    <th className="py-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {notas.map((n) => {
                    const { nome, doc } = linhaDe(n)
                    const canc = n.status === 'cancelado'
                    return (
                      <tr key={n.id} className={cx('break-inside-avoid align-top', canc && 'text-muted')}>
                        <td className="num whitespace-nowrap py-2 pr-3">{dataHoraBR(n.created_at)}</td>
                        {isAdmin && <td className="py-2 pr-3">{nomeLoja(n.loja?.nome)}</td>}
                        <td className="py-2 pr-3">
                          <p className="whitespace-nowrap font-semibold">{nomeModelo(n.modelo)} <span className="num">{n.numero || '—'}</span>{n.serie ? <span className="num text-muted"> / {n.serie}</span> : null}</p>
                          {n.chave && <p className="num break-all text-[11px] text-muted print:text-[9px]">{n.chave}</p>}
                          {n.ambiente !== 'producao' && <p className="text-xs font-semibold text-accent-dark">Teste</p>}
                        </td>
                        <td className="py-2 pr-3"><p>{nome}</p><p className="num text-xs text-muted">{doc ? docTxt(doc) : ''}</p></td>
                        <td className="num py-2 pr-3">{n.venda?.numero ? <Link to={`/vendas/${n.venda_id}`} className="text-brand hover:underline print:text-ink">{n.venda.numero}</Link> : '—'}</td>
                        <td className={cx('num whitespace-nowrap py-2 pr-3 text-right font-semibold', canc && 'line-through')}>{brl(Number(n.valor))}</td>
                        <td className="py-2">
                          <span className={cx('whitespace-nowrap font-semibold', canc ? 'text-danger' : 'text-ok')}>{canc ? 'Cancelada' : 'Autorizada'}</span>
                          {canc && n.cancelada_em && <p className="num text-xs">{dataBR(n.cancelada_em)}</p>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t-2 border-line">
                  <tr>
                    <td className="pt-3 font-semibold" colSpan={isAdmin ? 5 : 4}>Total autorizado ({resumo.aut} nota{resumo.aut === 1 ? '' : 's'})</td>
                    <td className="num pt-3 text-right font-bold">{brl(resumo.autValor)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>
        </>
      )}
      <ArquivosContabilidade lojaId={lojaZip} />
    </div>
  )
}
