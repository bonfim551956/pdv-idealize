import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { brl, dataBR, dataHoraBR, grau } from '../lib/format'
import { Button, Spinner, Alert, cx } from '../components/ui'
import { FORMAS } from '../features/recebimento/RecebimentoForm'

const VIAS = [
  { key: 'cliente', label: 'Via do cliente' },
  { key: 'laboratorio', label: 'Via do laboratório' },
  { key: 'loja', label: 'Via da loja' },
]
const TIPO_ARO = { nenhum: '—', fechada: 'Fechado', fio_nylon: 'Fio de nylon', parafusada: 'Parafusado', propria_cliente: 'Armação do cliente' }
const AVISO = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'E-mail', TELEFONE: 'Telefone', NENHUM: 'Não avisar' }

const um = (x) => (Array.isArray(x) ? x[0] : x) || null
const cpf = (d) => (d && d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d || '')
const fone = (d) => (!d ? '' : d.length === 11 ? d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3'))
const mm = (v) => (v === null || v === undefined || v === '' ? '—' : `${String(Number(v)).replace('.', ',')}`)
const dia = (iso) => (iso ? dataBR(`${iso}T12:00:00`) : '')

/* ---------- Blocos reutilizados nas vias ---------- */
function Cabecalho({ venda, os, via }) {
  const loja = venda.loja
  return (
    <header className="flex items-start justify-between gap-4 border-b-2 border-[#1A1A1A] pb-3">
      <div className="flex items-start gap-3">
        <svg width="44" height="22" viewBox="0 0 40 20" aria-hidden className="mt-1 shrink-0">
          <circle cx="10" cy="10" r="8" fill="none" stroke="#1A1A1A" strokeWidth="2.5" />
          <circle cx="30" cy="10" r="8" fill="none" stroke="#1A1A1A" strokeWidth="2.5" />
          <path d="M18 9 Q20 6 22 9" fill="none" stroke="#1A1A1A" strokeWidth="2" />
        </svg>
        <div className="leading-tight">
          <p className="text-base font-bold">{loja.nome}</p>
          {loja.endereco && <p className="text-xs">{loja.endereco}</p>}
          <p className="text-xs">{[loja.telefone && `Tel. ${loja.telefone}`, loja.whatsapp && `WhatsApp ${loja.whatsapp}`, loja.cnpj && `CNPJ ${loja.cnpj}`].filter(Boolean).join('   ')}</p>
        </div>
      </div>
      <div className="text-right leading-tight">
        <p className="inline-block rounded border-2 border-[#1A1A1A] px-2 py-0.5 text-xs font-bold">{via}</p>
        <p className="mt-1 text-xl font-bold num">OS {os.numero}</p>
        <p className="text-xs num">Venda {venda.numero} · OS {os.letra} · {dataHoraBR(venda.data_venda)}</p>
      </div>
    </header>
  )
}

function Bloco({ titulo, children, className }) {
  return (
    <section className={cx('break-inside-avoid', className)}>
      <h3 className="mb-1 border-b border-[#9AA5AD] pb-0.5 text-xs font-bold">{titulo}</h3>
      {children}
    </section>
  )
}

function Linha({ l, v, forte }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0 text-[#52626E]">{l}</span>
      <span className={cx('min-w-0', forte && 'font-bold')}>{v || '—'}</span>
    </div>
  )
}

function TabelaReceita({ os, comPrisma }) {
  const rx = Object.fromEntries((os.receitas || []).map((r) => [r.olho, r]))
  const cols = [['esferico_longe', 'Esf. longe'], ['cilindrico', 'Cilíndrico'], ['eixo', 'Eixo'], ['adicao', 'Adição'], ['esferico_perto', 'Esf. perto'], ...(comPrisma ? [['prisma', 'Prisma']] : [])]
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th className="w-12 border border-[#9AA5AD] px-1 py-1" />
          {cols.map(([, l]) => <th key={l} className="border border-[#9AA5AD] px-1 py-1 font-semibold">{l}</th>)}
        </tr>
      </thead>
      <tbody>
        {['OD', 'OE'].map((o) => {
          const r = rx[o] || {}
          return (
            <tr key={o}>
              <td className="border border-[#9AA5AD] px-1 py-1.5 text-center font-bold">{o}</td>
              {cols.map(([k]) => (
                <td key={k} className="border border-[#9AA5AD] px-1 py-1.5 text-center num text-sm font-semibold">
                  {k === 'eixo' ? (r.eixo != null ? `${r.eixo}°` : '') : k === 'prisma' ? (r.prisma ? `${mm(r.prisma)} ${r.prisma_base || ''}` : '') : grau(r[k])}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function TabelaLentes({ os }) {
  const lentes = [...(os.lentes || [])].sort((a, b) => a.olho.localeCompare(b.olho))
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {['Olho', 'Lente', 'SKU', 'DNP (mm)', 'Altura (mm)'].map((h) => <th key={h} className="border border-[#9AA5AD] px-1 py-1 text-left font-semibold">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {lentes.map((l) => (
          <tr key={l.olho}>
            <td className="border border-[#9AA5AD] px-1 py-1.5 font-bold">{l.olho}</td>
            <td className="border border-[#9AA5AD] px-1 py-1.5">{l.produto?.nome}</td>
            <td className="border border-[#9AA5AD] px-1 py-1.5 num">{l.produto?.sku}</td>
            <td className="border border-[#9AA5AD] px-1 py-1.5 num text-sm font-bold">{mm(l.dnp)}</td>
            <td className="border border-[#9AA5AD] px-1 py-1.5 num text-sm font-bold">{mm(l.altura)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Armacao({ os }) {
  const a = um(os.armacao)
  if (!a) return <p className="text-xs">Sem armação informada.</p>
  return (
    <div className="flex flex-col gap-1">
      <Linha l="Armação" v={a.produto ? `${a.produto.nome} (SKU ${a.produto.sku})` : 'Armação do cliente'} forte />
      <div className="grid grid-cols-4 gap-2">
        <Linha l="M.H.A" v={mm(a.mha)} /><Linha l="M.V.A" v={mm(a.mva)} /><Linha l="Ponte" v={mm(a.ponte)} /><Linha l="D.M.A" v={mm(a.dma)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Linha l="Aro" v={TIPO_ARO[a.tipo]} />
        <Linha l="Modelo" v={a.modelo_desenho} />
        <Linha l="Montagem" v={a.enviar_montagem ? 'Sim' : 'Não'} />
        <Linha l="Clip-on" v={a.clipon ? 'Sim' : 'Não'} />
      </div>
    </div>
  )
}

function Itens({ itens, comValores = true }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-[#9AA5AD]">
          <th className="py-1 text-left font-semibold">Produto</th>
          <th className="py-1 text-center font-semibold">Qtd</th>
          {comValores && <><th className="py-1 text-right font-semibold">Unitário</th><th className="py-1 text-right font-semibold">Desconto</th><th className="py-1 text-right font-semibold">Total</th></>}
        </tr>
      </thead>
      <tbody>
        {itens.map((i, k) => (
          <tr key={k} className="border-b border-[#D4DDE2]">
            <td className="py-1">{i.descricao}{i.olho && i.olho !== 'AMBOS' ? ` (${i.olho})` : ''}</td>
            <td className="py-1 text-center num">{Number(i.quantidade)}</td>
            {comValores && <><td className="py-1 text-right num">{brl(i.preco_unitario)}</td><td className="py-1 text-right num">{Number(i.desconto) ? `− ${brl(i.desconto)}` : ''}</td><td className="py-1 text-right num font-semibold">{brl(i.total)}</td></>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Pagamentos({ venda }) {
  const ativos = venda.recebimentos.filter((r) => r.status === 'ativo')
  const recebido = ativos.reduce((s, r) => s + Number(r.valor), 0)
  const saldo = Number(venda.total_liquido) - recebido
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex justify-between"><span>Subtotal</span><span className="num">{brl(venda.total_bruto)}</span></div>
      {Number(venda.total_desconto) > 0 && <div className="flex justify-between"><span>Desconto</span><span className="num">− {brl(venda.total_desconto)}</span></div>}
      <div className="flex justify-between border-t border-[#1A1A1A] pt-1 text-sm font-bold"><span>Total</span><span className="num">{brl(venda.total_liquido)}</span></div>
      {ativos.map((r, k) => (
        <div key={k} className="flex flex-col">
          <div className="flex justify-between">
            <span>{FORMAS[r.forma]}{r.forma === 'CARTAO' ? ` ${r.modalidade === 'DEBITO' ? 'débito' : `crédito ${r.parcelas}x`}${r.bandeira ? ` ${r.bandeira}` : ''}` : ''}</span>
            <span className="num">{brl(r.valor)}</span>
          </div>
          {['CARNE', 'BOLETO', 'CHEQUE'].includes(r.forma) && r.detalhe?.length > 0 && (
            <p className="pl-2 text-[#52626E] num">
              {[...r.detalhe].sort((a, b) => a.numero - b.numero).map((p) => `${p.numero}ª ${brl(p.valor)} venc. ${dia(p.vencimento)}${p.documento ? ` nº ${p.documento}` : ''}`).join(' · ')}
            </p>
          )}
        </div>
      ))}
      <div className="flex justify-between border-t border-[#1A1A1A] pt-1 text-sm font-bold">
        <span>{saldo > 0 ? 'Saldo a pagar na retirada' : 'Situação'}</span>
        <span className="num">{saldo > 0 ? brl(saldo) : 'Quitado'}</span>
      </div>
    </div>
  )
}

function Assinatura({ texto }) {
  return (
    <div className="flex flex-col gap-1 pt-6 text-xs">
      <div className="border-t border-[#1A1A1A]" />
      <span>{texto}</span>
    </div>
  )
}

/* ---------- As três vias ---------- */
function ViaCliente({ venda, os }) {
  const itensOS = venda.itens.filter((i) => i.os_id === os.id || !i.os_id)
  return (
    <>
      <Cabecalho venda={venda} os={os} via="Via do cliente" />
      <div className="grid grid-cols-2 gap-4">
        <Bloco titulo="Cliente">
          <Linha l="Nome" v={venda.cliente.nome} forte />
          {os.paciente?.nome !== venda.cliente.nome && <Linha l="Paciente" v={os.paciente?.nome} />}
          <Linha l="Atendido por" v={venda.vendedor.nome} />
        </Bloco>
        <Bloco titulo="Entrega">
          <p className="text-base font-bold">{dataHoraBR(os.previsao_entrega)}</p>
          <p className="text-xs">Avisaremos por {AVISO[os.aviso_entrega]?.toLowerCase()} quando seus óculos estiverem prontos.</p>
        </Bloco>
      </div>
      <Bloco titulo="Sua receita"><TabelaReceita os={os} /></Bloco>
      <Bloco titulo="Produtos"><Itens itens={itensOS} /></Bloco>
      <Bloco titulo="Pagamento"><Pagamentos venda={venda} /></Bloco>
      <p className="mt-auto border-t border-[#9AA5AD] pt-2 text-xs">Apresente esta via para retirar seus óculos.</p>
    </>
  )
}

function ViaLaboratorio({ venda, os }) {
  return (
    <>
      <Cabecalho venda={venda} os={os} via="Via do laboratório" />
      <div className="grid grid-cols-3 gap-4">
        <Bloco titulo="Paciente" className="col-span-2">
          <p className="text-base font-bold">{os.paciente?.nome}</p>
          <Linha l="Loja" v={venda.loja.nome} />
          <Linha l="Laboratório" v={os.laboratorio?.nome || 'Não informado'} />
        </Bloco>
        <Bloco titulo="Entregar na loja até">
          <p className="text-base font-bold">{dataHoraBR(os.previsao_entrega)}</p>
          <Linha l="Receita de" v={dia(os.data_receita)} />
        </Bloco>
      </div>
      <Bloco titulo="Receita"><TabelaReceita os={os} comPrisma /></Bloco>
      <Bloco titulo="Lentes e medidas"><TabelaLentes os={os} /></Bloco>
      <Bloco titulo="Armação"><Armacao os={os} /></Bloco>
      <div className="grid grid-cols-3 gap-4">
        <Bloco titulo="Iniciais na lente"><p className="text-sm font-bold">{os.iniciais || '—'}</p></Bloco>
        <Bloco titulo="Observações" className="col-span-2"><p className="whitespace-pre-wrap text-xs">{os.observacoes || '—'}</p></Bloco>
      </div>
      <Bloco titulo="Controle de produção" className="mt-auto">
        <div className="grid grid-cols-3 gap-6">
          <Assinatura texto="Surfaçagem · data e responsável" />
          <Assinatura texto="Montagem · data e responsável" />
          <Assinatura texto="Conferência final · data e responsável" />
        </div>
      </Bloco>
    </>
  )
}

function ViaLoja({ venda, os }) {
  const principal = venda.cliente.contatos?.find((c) => c.principal) || venda.cliente.contatos?.[0]
  const itensOS = venda.itens.filter((i) => i.os_id === os.id || !i.os_id)
  return (
    <>
      <Cabecalho venda={venda} os={os} via="Via da loja" />
      <div className="grid grid-cols-2 gap-4">
        <Bloco titulo="Cliente">
          <Linha l="Nome" v={venda.cliente.nome} forte />
          <Linha l="CPF" v={cpf(venda.cliente.documento)} />
          <Linha l="Contato" v={fone(principal?.valor)} />
          <Linha l="Paciente" v={os.paciente?.nome} />
        </Bloco>
        <Bloco titulo="Venda">
          <Linha l="Vendedor" v={venda.vendedor.nome} />
          <Linha l="Meio de contato" v={venda.campos_extras?.meio_contato} />
          <Linha l="Entrega prevista" v={dataHoraBR(os.previsao_entrega)} forte />
          <Linha l="Aviso" v={AVISO[os.aviso_entrega]} />
        </Bloco>
      </div>
      <Bloco titulo="Receita"><TabelaReceita os={os} comPrisma /></Bloco>
      <Bloco titulo="Lentes e medidas"><TabelaLentes os={os} /></Bloco>
      <Bloco titulo="Armação"><Armacao os={os} /></Bloco>
      <div className="grid grid-cols-2 gap-4">
        <Bloco titulo="Produtos"><Itens itens={itensOS} /></Bloco>
        <Bloco titulo="Pagamento"><Pagamentos venda={venda} /></Bloco>
      </div>
      {(venda.observacoes || os.observacoes) && (
        <Bloco titulo="Observações"><p className="whitespace-pre-wrap text-xs">{[venda.observacoes, os.observacoes].filter(Boolean).join('\n')}</p></Bloco>
      )}
      <div className="mt-auto grid grid-cols-2 gap-8">
        <Assinatura texto="Recebi os óculos em ____/____/______ · assinatura do cliente" />
        <Assinatura texto="Entregue por (colaborador)" />
      </div>
    </>
  )
}

export const COMPONENTE = { cliente: ViaCliente, laboratorio: ViaLaboratorio, loja: ViaLoja }

export default function ImprimirOS() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const [venda, setVenda] = useState(null)
  const [erro, setErro] = useState(null)
  const [vias, setVias] = useState({ cliente: true, laboratorio: true, loja: true })
  const [osSel, setOsSel] = useState(params.get('os') || 'todas')

  useEffect(() => {
    supabase.from('vendas').select(`
      id, numero, data_venda, observacoes, campos_extras, total_bruto, total_desconto, total_liquido,
      cliente:clientes(nome, documento, contatos:cliente_contatos(tipo, valor, principal)),
      vendedor:colaboradores!vendas_vendedor_id_fkey(nome),
      loja:lojas(nome, cidade, endereco, telefone, whatsapp, cnpj),
      itens:itens_venda(descricao, sku, olho, quantidade, preco_unitario, desconto, total, os_id),
      ordens:ordens_servico(id, numero, letra, data_receita, previsao_entrega, iniciais, observacoes, aviso_entrega,
        paciente:clientes(nome), laboratorio:laboratorios(nome),
        receitas(olho, esferico_longe, cilindrico, eixo, adicao, esferico_perto, prisma, prisma_base),
        armacao:os_armacao(mha, mva, ponte, dma, tipo, modelo_desenho, enviar_montagem, clipon, produto:produtos(sku, nome)),
        lentes:os_lentes(olho, dnp, altura, produto:produtos(sku, nome))),
      recebimentos(forma, valor, modalidade, parcelas, bandeira, status, detalhe:recebimento_parcelas(numero, valor, vencimento, documento))
    `).eq('id', id).single().then(({ data, error }) => {
      if (error) setErro(mensagemErro(error))
      else setVenda({ ...data, ordens: [...data.ordens].sort((a, b) => a.letra.localeCompare(b.letra)) })
    })
  }, [id])

  const ordens = useMemo(() => (venda ? venda.ordens.filter((o) => osSel === 'todas' || o.id === osSel) : []), [venda, osSel])
  const paginas = ordens.flatMap((os) => VIAS.filter((v) => vias[v.key]).map((v) => ({ os, via: v.key })))

  useEffect(() => { if (venda) document.title = `OS venda ${venda.numero}` }, [venda])

  if (erro) return <div className="mx-auto max-w-3xl p-6"><Alert>{erro}</Alert></div>
  if (!venda) return <Spinner label="Preparando a ordem de serviço" />

  return (
    <div className="min-h-screen bg-bg print:bg-[#FAFAFA]">
      {/* Controles: não saem na impressão */}
      <div className="no-print sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link to={`/vendas/${id}`} className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Venda {venda.numero}</Link>
          <div className="flex flex-wrap items-center gap-4">
            {venda.ordens.length > 1 && (
              <select aria-label="Ordem de serviço" value={osSel} onChange={(e) => setOsSel(e.target.value)} className="h-10 rounded-md border border-line bg-surface px-2 text-sm">
                <option value="todas">Todas as OS</option>
                {venda.ordens.map((o) => <option key={o.id} value={o.id}>OS {o.letra} · nº {o.numero}</option>)}
              </select>
            )}
            {VIAS.map((v) => (
              <label key={v.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#0D5C75]" checked={vias[v.key]} onChange={(e) => setVias((x) => ({ ...x, [v.key]: e.target.checked }))} />
                {v.label.replace('Via do ', '').replace('Via da ', '')}
              </label>
            ))}
            <Button size="sm" icon={Printer} disabled={paginas.length === 0} onClick={() => window.print()}>Imprimir</Button>
          </div>
        </div>
      </div>

      {venda.ordens.length === 0 ? (
        <div className="mx-auto max-w-[210mm] p-6"><Alert tone="warn">Esta venda não tem ordem de serviço.</Alert></div>
      ) : paginas.length === 0 ? (
        <div className="mx-auto max-w-[210mm] p-6"><Alert tone="warn">Marque pelo menos uma via para imprimir.</Alert></div>
      ) : (
        <div className="flex flex-col items-center gap-6 py-6 print:block print:py-0">
          {paginas.map(({ os, via }) => {
            const Via = COMPONENTE[via]
            return (
              <article key={`${os.id}-${via}`} className="folha-os flex flex-col gap-3 bg-[#FAFAFA] text-[#1A1A1A] shadow-lg print:shadow-none">
                <Via venda={venda} os={os} />
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
