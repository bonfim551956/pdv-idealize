import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Scissors } from 'lucide-react'
import { supabase, mensagemErro } from '../lib/supabase'
import { brl, dataBR, dataHoraBR, grau } from '../lib/format'
import { Button, Spinner, Alert, cx } from '../components/ui'
import { FORMAS } from '../features/recebimento/RecebimentoForm'

/*
  Folha A4 única com as 3 vias (loja, laboratório e cliente), separadas por linha de recorte.
  Tamanhos em mm e fontes pequenas de propósito: é um documento impresso, não uma tela.
*/

const TIPO_ARO = { nenhum: '', fechada: 'aro fechado', fio_nylon: 'fio de nylon', parafusada: 'parafusado', propria_cliente: 'armação do cliente' }
const AVISO = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'E-mail', TELEFONE: 'Telefone', NENHUM: 'Não avisar' }
const MAX_ITENS = 5

const um = (x) => (Array.isArray(x) ? x[0] : x) || null
const cpf = (d) => (d && d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d || '')
const fone = (d) => (!d ? '' : d.length === 11 ? d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3'))
const mm = (v) => (v === null || v === undefined || v === '' ? '' : String(Number(v)).replace('.', ','))
const dia = (iso) => (iso ? dataBR(`${iso}T12:00:00`) : '')

/* ---------- peças ---------- */
function Cabecalho({ venda, os, via }) {
  const l = venda.loja
  return (
    <header className="flex items-center justify-between gap-3 border-b-[1.5px] border-[#0B6E71] pb-[2mm]">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Óticas Idealize" className="h-[9mm] w-auto" />
        <div className="border-l border-[#D2DEDF] pl-3 text-[9px] leading-tight text-[#4E6468]">
          <p className="text-[10px] font-bold text-[#16272B]">{l.nome}</p>
          {l.endereco && <p>{l.endereco}</p>}
          <p>{[l.telefone && `Tel. ${l.telefone}`, l.whatsapp && `WhatsApp ${l.whatsapp}`].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-right">
        <div className="text-[9px] leading-tight text-[#4E6468]">
          <p>Venda <b className="num text-[#16272B]">{venda.numero}</b> · OS {os.letra}</p>
          <p className="num">{dataHoraBR(venda.data_venda)}</p>
        </div>
        <div className="rounded-[1.5mm] bg-[#0B6E71] px-[2.5mm] py-[1mm] text-[#FAFAFA]" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          <p className="text-[7px] font-bold uppercase tracking-wider leading-none">{via}</p>
          <p className="num font-display text-[16px] font-extrabold leading-tight">OS {os.numero}</p>
        </div>
      </div>
    </header>
  )
}

function Rotulo({ children }) {
  return <p className="text-[8px] font-semibold uppercase tracking-wide text-[#4E6468]">{children}</p>
}

function Dado({ rotulo, children, forte, className }) {
  return (
    <div className={cx('min-w-0', className)}>
      <Rotulo>{rotulo}</Rotulo>
      <p className={cx('truncate text-[10px] leading-snug', forte && 'text-[11px] font-bold')}>{children || '—'}</p>
    </div>
  )
}

function TabelaReceita({ os, prisma }) {
  const rx = Object.fromEntries((os.receitas || []).map((r) => [r.olho, r]))
  const med = Object.fromEntries((os.lentes || []).map((l) => [l.olho, l]))
  const th = 'border border-[#9AB0B2] px-1 py-[0.6mm] text-[8px] font-semibold uppercase tracking-wide text-[#4E6468]'
  const td = 'border border-[#9AB0B2] px-1 py-[1mm] text-center num text-[11px] font-bold'
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={cx(th, 'w-[9mm]')} />
          <th className={th}>Esf. longe</th><th className={th}>Cilíndrico</th><th className={th}>Eixo</th>
          <th className={th}>Adição</th><th className={th}>Esf. perto</th>
          {prisma && <th className={th}>Prisma</th>}
          <th className={cx(th, 'bg-[#E1F2F2] text-[#0B6E71]')}>DNP</th>
          <th className={cx(th, 'bg-[#E1F2F2] text-[#0B6E71]')}>Altura</th>
        </tr>
      </thead>
      <tbody>
        {['OD', 'OE'].map((o) => {
          const r = rx[o] || {}
          const m = med[o] || {}
          return (
            <tr key={o}>
              <td className={cx(td, 'font-display')}>{o}</td>
              <td className={td}>{grau(r.esferico_longe)}</td>
              <td className={td}>{grau(r.cilindrico)}</td>
              <td className={td}>{r.eixo != null ? `${r.eixo}°` : ''}</td>
              <td className={td}>{grau(r.adicao)}</td>
              <td className={td}>{grau(r.esferico_perto)}</td>
              {prisma && <td className={td}>{r.prisma ? `${mm(r.prisma)} ${r.prisma_base || ''}` : ''}</td>}
              <td className={cx(td, 'bg-[#E1F2F2]')}>{mm(m.dnp)}</td>
              <td className={cx(td, 'bg-[#E1F2F2]')}>{mm(m.altura)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function LenteArmacao({ os }) {
  const lentes = [...(os.lentes || [])].sort((a, b) => a.olho.localeCompare(b.olho))
  const iguais = lentes.length === 2 && lentes[0].produto?.sku === lentes[1].produto?.sku
  const a = um(os.armacao)
  const medidas = a && [['MHA', a.mha], ['MVA', a.mva], ['Ponte', a.ponte], ['DMA', a.dma]].filter(([, v]) => v != null).map(([k, v]) => `${k} ${mm(v)}`).join(' · ')
  return (
    <div className="grid grid-cols-2 gap-[3mm] text-[10px] leading-snug">
      <div>
        <Rotulo>Lente</Rotulo>
        {iguais ? (
          <p><b>{lentes[0].produto?.nome}</b> <span className="text-[#4E6468]">· {lentes[0].produto?.sku} · ambos os olhos</span></p>
        ) : lentes.map((l) => (
          <p key={l.olho}><b>{l.olho}</b> {l.produto?.nome} <span className="text-[#4E6468]">· {l.produto?.sku}</span></p>
        ))}
      </div>
      <div>
        <Rotulo>Armação</Rotulo>
        <p><b>{a?.produto ? a.produto.nome : 'Armação do cliente'}</b>{a?.produto && <span className="text-[#4E6468]"> · {a.produto.sku}</span>}</p>
        <p className="num text-[#4E6468]">
          {[medidas, TIPO_ARO[a?.tipo], a?.modelo_desenho, a?.enviar_montagem ? 'enviar p/ montagem' : 'sem montagem', a?.clipon && 'clip-on'].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  )
}

function Recorte() {
  return (
    <div className="flex items-center gap-2 py-[2mm] text-[#9AB0B2]" aria-hidden>
      <Scissors className="h-3 w-3" />
      <span className="flex-1 border-t border-dashed border-[#9AB0B2]" />
    </div>
  )
}

/* ---------- vias ---------- */
function ViaLoja({ venda, os }) {
  const contato = venda.cliente.contatos?.find((c) => c.principal) || venda.cliente.contatos?.[0]
  const itens = venda.itens.filter((i) => i.os_id === os.id || !i.os_id)
  const ativos = venda.recebimentos.filter((r) => r.status === 'ativo')
  const recebido = ativos.reduce((s, r) => s + Number(r.valor), 0)
  const saldo = Number(venda.total_liquido) - recebido
  return (
    <section className="flex h-[122mm] flex-col gap-[2.5mm] overflow-hidden">
      <Cabecalho venda={venda} os={os} via="Via da loja" />
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-[3mm]">
        <Dado rotulo="Cliente" forte>{venda.cliente.nome}</Dado>
        <Dado rotulo="CPF">{cpf(venda.cliente.documento)}</Dado>
        <Dado rotulo="Contato">{fone(contato?.valor)}</Dado>
        <Dado rotulo="Consultor">{venda.vendedor.nome}</Dado>
        <Dado rotulo="Paciente">{os.paciente?.nome}</Dado>
        <Dado rotulo="Meio de contato">{venda.campos_extras?.meio_contato}</Dado>
        <Dado rotulo="Entrega prevista" forte>{dataHoraBR(os.previsao_entrega)}</Dado>
        <Dado rotulo="Avisar por">{AVISO[os.aviso_entrega]}</Dado>
      </div>
      <TabelaReceita os={os} />
      <LenteArmacao os={os} />
      <div className="grid grid-cols-[1.5fr_1fr] gap-[4mm] text-[10px]">
        <div>
          <Rotulo>Produtos</Rotulo>
          {itens.slice(0, MAX_ITENS).map((i, k) => (
            <p key={k} className="flex justify-between gap-2 border-b border-dotted border-[#D2DEDF] leading-snug">
              <span className="truncate">{Number(i.quantidade)}× {i.descricao}</span>
              <span className="num shrink-0">{brl(i.total)}</span>
            </p>
          ))}
          {itens.length > MAX_ITENS && <p className="text-[#4E6468]">+ {itens.length - MAX_ITENS} itens</p>}
        </div>
        <div className="leading-snug">
          <Rotulo>Pagamento</Rotulo>
          {Number(venda.total_desconto) > 0 && <p className="flex justify-between"><span>Desconto</span><span className="num">− {brl(venda.total_desconto)}</span></p>}
          <p className="flex justify-between font-bold"><span>Total</span><span className="num">{brl(venda.total_liquido)}</span></p>
          {ativos.slice(0, 3).map((r, k) => (
            <p key={k} className="flex justify-between text-[#4E6468]">
              <span className="truncate">{FORMAS[r.forma]}{r.forma === 'CARTAO' ? ` ${r.modalidade === 'DEBITO' ? 'déb.' : `${r.parcelas}x`}` : ''}{r.detalhe?.length > 1 ? ` ${r.detalhe.length}x` : ''}</span>
              <span className="num">{brl(r.valor)}</span>
            </p>
          ))}
          <p className="flex justify-between border-t border-[#16272B] font-bold"><span>{saldo > 0 ? 'Saldo na retirada' : 'Situação'}</span><span className="num">{saldo > 0 ? brl(saldo) : 'Quitado'}</span></p>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-[1fr_1fr] gap-[8mm] text-[8px] text-[#4E6468]">
        <p className="border-t border-[#16272B] pt-[0.5mm]">Recebi os óculos em ___/___/_____ · assinatura do cliente</p>
        <p className="border-t border-[#16272B] pt-[0.5mm]">Entregue por</p>
      </div>
    </section>
  )
}

function ViaLaboratorio({ venda, os }) {
  return (
    <section className="flex h-[98mm] flex-col gap-[2.5mm] overflow-hidden">
      <Cabecalho venda={venda} os={os} via="Via do laboratório" />
      <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-[3mm]">
        <Dado rotulo="Paciente" forte>{os.paciente?.nome}</Dado>
        <Dado rotulo="Receita de">{dia(os.data_receita)}</Dado>
        <Dado rotulo="Laboratório">{os.laboratorio?.nome || 'Não informado'}</Dado>
        <Dado rotulo="Entregar na loja até" forte>{dataHoraBR(os.previsao_entrega)}</Dado>
      </div>
      <TabelaReceita os={os} prisma />
      <LenteArmacao os={os} />
      <div className="grid grid-cols-[1fr_4fr] gap-[3mm]">
        <Dado rotulo="Iniciais">{os.iniciais}</Dado>
        <div className="min-w-0">
          <Rotulo>Observações</Rotulo>
          <p className="line-clamp-2 whitespace-pre-wrap text-[10px] leading-snug">{os.observacoes || '—'}</p>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-[6mm] text-[8px] text-[#4E6468]">
        {['Surfaçagem', 'Montagem', 'Conferência final'].map((t) => (
          <p key={t} className="flex items-end gap-1 border-t border-[#16272B] pt-[0.5mm]">
            <span className="inline-block h-[2.5mm] w-[2.5mm] border border-[#16272B]" /> {t} · data e responsável
          </p>
        ))}
      </div>
    </section>
  )
}

function ViaCliente({ venda, os }) {
  const l = venda.loja
  return (
    <section className="flex h-[40mm] items-stretch gap-[5mm] overflow-hidden rounded-[2mm] border border-[#D2DEDF]">
      {/* Faixa laranja: o traço vertical da logo */}
      <span className="w-[2mm] shrink-0 bg-[#FC9E3C]" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} />
      <div className="flex w-[62mm] shrink-0 flex-col justify-center gap-[1.5mm] py-[3mm]">
        <img src="/logo.png" alt="Óticas Idealize" className="h-[10mm] w-auto self-start" />
        <div className="text-[9px] leading-tight text-[#4E6468]">
          <p className="font-bold text-[#16272B]">{l.nome}</p>
          {l.endereco && <p>{l.endereco}</p>}
          {l.telefone && <p>Tel. {l.telefone}</p>}
          {l.whatsapp && <p>WhatsApp {l.whatsapp}</p>}
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 content-center gap-x-[5mm] gap-y-[2.5mm] py-[3mm] pr-[5mm]">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-wider text-[#0B6E71]">Via do cliente</p>
          <p className="num font-display text-[15px] font-extrabold leading-tight">OS {os.numero}</p>
        </div>
        <div>
          <Rotulo>Valor da compra</Rotulo>
          <p className="num font-display text-[15px] font-extrabold leading-tight">{brl(venda.total_liquido)}</p>
        </div>
        <div>
          <Rotulo>Data da compra</Rotulo>
          <p className="num text-[12px] font-bold">{dataBR(venda.data_venda)}</p>
        </div>
        <div>
          <Rotulo>Retirada a partir de</Rotulo>
          <p className="num text-[12px] font-bold">{dataHoraBR(os.previsao_entrega)}</p>
        </div>
      </div>
    </section>
  )
}

export default function ImprimirOS() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const [venda, setVenda] = useState(null)
  const [erro, setErro] = useState(null)
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
  useEffect(() => { if (venda) document.title = `OS venda ${venda.numero} - Óticas Idealize` }, [venda])

  if (erro) return <div className="mx-auto max-w-3xl p-6"><Alert>{erro}</Alert></div>
  if (!venda) return <Spinner label="Preparando a ordem de serviço" />

  return (
    <div className="min-h-screen bg-bg">
      <div className="no-print sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link to={`/vendas/${id}`} className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Venda {venda.numero}</Link>
          <div className="flex items-center gap-3">
            {venda.ordens.length > 1 && (
              <select aria-label="Ordem de serviço" value={osSel} onChange={(e) => setOsSel(e.target.value)} className="h-10 rounded-md border border-line bg-surface px-2 text-sm">
                <option value="todas">Todas as OS ({venda.ordens.length} folhas)</option>
                {venda.ordens.map((o) => <option key={o.id} value={o.id}>OS {o.letra} · nº {o.numero}</option>)}
              </select>
            )}
            <Button size="sm" icon={Printer} onClick={() => window.print()}>Imprimir</Button>
          </div>
        </div>
      </div>

      {ordens.length === 0 ? (
        <div className="mx-auto max-w-[210mm] p-6"><Alert tone="warn">Esta venda não tem ordem de serviço.</Alert></div>
      ) : (
        <div className="flex flex-col items-start gap-6 overflow-x-auto py-6 md:items-center print:block print:overflow-visible print:py-0">
          {ordens.map((os) => (
            <article key={os.id} className="folha-os flex flex-col bg-[#FAFAFA] text-[#16272B] shadow-lg print:shadow-none">
              <ViaLoja venda={venda} os={os} />
              <Recorte />
              <ViaLaboratorio venda={venda} os={os} />
              <Recorte />
              <ViaCliente venda={venda} os={os} />
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
export { ViaLoja, ViaLaboratorio, ViaCliente }
