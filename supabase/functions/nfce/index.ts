import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// NFC-e pela Focus NFe. Emitir, consultar, cancelar e configurar a loja.
// Os tokens da Focus ficam em pdv.lojas_fiscal (sem acesso pelo navegador); só esta função lê.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const erro = (m: string, s = 400) => resp({ erro: m }, s)
const HOST = { homologacao: 'https://homologacao.focusnfe.com.br', producao: 'https://api.focusnfe.com.br' } as const
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const r2 = (n: number) => Math.round(n * 100) / 100
const BANDEIRA: Record<string, string> = { visa: '01', mastercard: '02', 'american express': '03', amex: '03', elo: '06', hipercard: '07' }
function formaFocus(r: { forma: string; modalidade?: string }) {
  switch (r.forma) {
    case 'DINHEIRO': return '01'
    case 'CHEQUE': return '02'
    case 'CARTAO': return r.modalidade === 'DEBITO' ? '04' : '03'
    case 'PIX': return '17'
    case 'BOLETO': return '15'
    case 'CARNE': case 'CREDITOS': return '05'
    case 'CARTEIRA_DIGITAL': return '18'
    default: return '99'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'pdv' }, auth: { persistSession: false } })
  const tk = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await db.auth.getUser(tk)
  if (!u?.user) return erro('Sessão expirada. Entre novamente.', 401)
  const { data: eu } = await db.from('colaboradores').select('id, cargo, ativo, loja_id').eq('auth_user_id', u.user.id).maybeSingle()
  if (!eu?.ativo) return erro('Usuário sem acesso.', 403)
  const todasLojas = ['administrativo', 'supervisao', 'diretor'].includes(eu.cargo)
  const podeLoja = (lojaId: string) => todasLojas || eu.loja_id === lojaId

  let b: Record<string, any> = {}
  try { b = await req.json() } catch { return erro('Requisição inválida.') }

  const configDe = async (lojaId: string) => {
    const { data: f } = await db.from('lojas_fiscal').select('*').eq('loja_id', lojaId).maybeSingle()
    const { data: l } = await db.from('lojas').select('id, nome, cnpj').eq('id', lojaId).maybeSingle()
    if (!f || !l) throw new Error('Loja sem configuração fiscal.')
    const amb = f.ambiente as 'homologacao' | 'producao'
    const token = amb === 'producao' ? f.token_producao : f.token_homologacao
    if (!token) throw new Error(`Falta o token da Focus NFe (${amb === 'producao' ? 'produção' : 'homologação'}) da loja ${l.nome}. Configure em Nota fiscal.`)
    if (!so(l.cnpj)) throw new Error(`A loja ${l.nome} está sem CNPJ cadastrado.`)
    return { f, l, amb, token, base: `${HOST[amb]}/v2`, auth: 'Basic ' + btoa(`${token}:`) }
  }
  const salvarResposta = async (notaId: string, amb: 'homologacao' | 'producao', j: any, extra: Record<string, unknown> = {}) => {
    const host = HOST[amb]
    const patch = {
      status: j.status || 'erro_autorizacao',
      numero: j.numero ?? null, serie: j.serie ?? null, chave: j.chave_nfe ?? null,
      danfe_url: j.caminho_danfe ? host + j.caminho_danfe : null,
      xml_url: j.caminho_xml_nota_fiscal ? host + j.caminho_xml_nota_fiscal : null,
      qrcode_url: j.qrcode_url ?? null, consulta_url: j.url_consulta_nf ?? null,
      mensagem: j.mensagem_sefaz || j.mensagem || (j.erros ? j.erros.map((e: any) => e.mensagem).join('; ') : null),
      resposta: j, ...extra,
    }
    const { data } = await db.from('notas_fiscais').update(patch).eq('id', notaId).select('*').single()
    return data
  }

  try {
    // ---------- Configurar a loja (diretor / supervisão) ----------
    if (b.acao === 'configurar') {
      if (!['supervisao', 'diretor'].includes(eu.cargo)) return erro('Só supervisão ou diretoria configura a nota fiscal.', 403)
      const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
      for (const k of ['inscricao_estadual', 'regime', 'csosn', 'pis_cst', 'cofins_cst', 'ambiente']) if (b[k] !== undefined && b[k] !== '') patch[k] = b[k]
      if (b.token_homologacao) patch.token_homologacao = String(b.token_homologacao).trim()
      if (b.token_producao) patch.token_producao = String(b.token_producao).trim()
      const { error } = await db.from('lojas_fiscal').upsert({ loja_id: b.loja_id, ...patch })
      if (error) return erro(error.message)
      return resp({ ok: true })
    }

    // ---------- Emitir ----------
    if (b.acao === 'emitir') {
      const { data: v } = await db.from('vendas').select('id, numero, status, loja_id, cliente_id, total_liquido').eq('id', b.venda_id).maybeSingle()
      if (!v) return erro('Venda não encontrada.', 404)
      if (!podeLoja(v.loja_id)) return erro('Venda de outra loja.', 403)
      if (v.status !== 'confirmada') return erro('Só venda confirmada emite nota.')
      const clienteId: string = b.cliente_id || v.cliente_id
      const { data: ja } = await db.from('notas_fiscais').select('id').eq('venda_id', v.id).eq('cliente_id', clienteId).in('status', ['autorizado', 'processando_autorizacao', 'processando']).limit(1)
      if (ja?.length) return erro('Já existe nota emitida para este cliente nesta venda.')
      const cfg = await configDe(v.loja_id)

      const { data: cli } = await db.from('clientes').select('id, nome, documento').eq('id', clienteId).maybeSingle()
      const { data: ordens } = await db.from('ordens_servico').select('id, paciente_id').eq('venda_id', v.id)
      const pacienteDe = Object.fromEntries((ordens || []).map((o: any) => [o.id, o.paciente_id || v.cliente_id]))
      const varios = new Set((ordens || []).map((o: any) => o.paciente_id || v.cliente_id)).size > 1
      const { data: itens } = await db.from('itens_venda').select('id, os_id, sku, descricao, quantidade, preco_unitario, desconto, total, produto:produtos(tipo, ncm, cfop, origem)').eq('venda_id', v.id)
      const meus = (itens || []).filter((i: any) => {
        if (!varios) return true
        const dono = i.os_id ? pacienteDe[i.os_id] : v.cliente_id
        return dono === clienteId
      }).filter((i: any) => i.produto?.tipo !== 'servico' && Number(i.total) > 0)
      if (!meus.length) return erro('Não há produtos com valor para esta nota (serviços vão em nota de serviço).')
      const semNcm = meus.filter((i: any) => !i.produto?.ncm)
      if (semNcm.length) return erro(`Produto sem NCM: ${semNcm.map((i: any) => i.descricao).join(', ')}`)

      const totalNota = r2(meus.reduce((t: number, i: any) => t + Number(i.total), 0))
      const items = meus.map((i: any, k: number) => {
        const q = Number(i.quantidade), pu = Number(i.preco_unitario)
        return {
          numero_item: String(k + 1), codigo_produto: i.sku || String(k + 1), descricao: String(i.descricao).slice(0, 120),
          codigo_ncm: i.produto.ncm, cfop: i.produto.cfop || '5102',
          unidade_comercial: 'UN', quantidade_comercial: q, valor_unitario_comercial: pu,
          unidade_tributavel: 'UN', quantidade_tributavel: q, valor_unitario_tributavel: pu,
          valor_bruto: r2(q * pu), ...(Number(i.desconto) > 0 ? { valor_desconto: r2(Number(i.desconto)) } : {}),
          icms_origem: String(i.produto.origem ?? 0), icms_situacao_tributaria: cfg.f.csosn,
          pis_situacao_tributaria: cfg.f.pis_cst, cofins_situacao_tributaria: cfg.f.cofins_cst,
        }
      })
      // Pagamentos deste cliente; o que faltar entra como crédito loja (saldo na retirada)
      const { data: recs } = await db.from('recebimentos').select('forma, modalidade, valor, bandeira, autorizacao, adquirente, pagador_id').eq('venda_id', v.id).eq('status', 'ativo')
      const pagos = (recs || []).filter((r: any) => !varios || (r.pagador_id || v.cliente_id) === clienteId)
      let restante = totalNota
      const formas: any[] = []
      for (const r of pagos) {
        if (restante <= 0) break
        const val = r2(Math.min(Number(r.valor), restante)); restante = r2(restante - val)
        const f: any = { forma_pagamento: formaFocus(r), valor_pagamento: val }
        if (r.forma === 'CARTAO') { f.tipo_integracao = '2'; f.bandeira_operadora = BANDEIRA[String(r.bandeira || '').toLowerCase()] || '99'; if (r.autorizacao) f.numero_autorizacao = r.autorizacao }
        formas.push(f)
      }
      if (restante > 0) formas.push({ forma_pagamento: '05', valor_pagamento: restante })

      const ref = `pdv-${v.numero}-${so(cli?.documento).slice(-4) || 'x'}-${Date.now().toString(36)}`
      const payload: Record<string, unknown> = {
        cnpj_emitente: so(cfg.l.cnpj), data_emissao: new Date().toISOString(),
        natureza_operacao: 'VENDA AO CONSUMIDOR', presenca_comprador: '1', modalidade_frete: '9', local_destino: '1',
        items, formas_pagamento: formas,
        informacoes_adicionais_contribuinte: `Venda ${v.numero} - PDV Óticas Idealize`,
      }
      const cpf = so(cli?.documento)
      if (cpf.length === 11) { payload.cpf_destinatario = cpf; if (cli?.nome) payload.nome_destinatario = cli.nome }
      if (cfg.f.serie) payload.serie = String(cfg.f.serie)

      const { data: nota, error: en } = await db.from('notas_fiscais').insert({
        venda_id: v.id, loja_id: v.loja_id, cliente_id: clienteId, ref, ambiente: cfg.amb, status: 'processando', valor: totalNota, emitida_por: eu.id,
      }).select('id').single()
      if (en) return erro(en.message, 500)
      const r = await fetch(`${cfg.base}/nfce?ref=${encodeURIComponent(ref)}`, { method: 'POST', headers: { Authorization: cfg.auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await r.json().catch(() => ({ status: 'erro_autorizacao', mensagem: `Focus NFe respondeu ${r.status}` }))
      if (!r.ok && !j.status) j.status = 'erro_autorizacao'
      return resp({ nota: await salvarResposta(nota.id, cfg.amb, j) })
    }

    // ---------- Consultar / Cancelar ----------
    if (b.acao === 'consultar' || b.acao === 'cancelar') {
      const { data: n } = await db.from('notas_fiscais').select('*').eq('id', b.nota_id).maybeSingle()
      if (!n) return erro('Nota não encontrada.', 404)
      if (!podeLoja(n.loja_id)) return erro('Nota de outra loja.', 403)
      const cfg = await configDe(n.loja_id)
      const base = `${HOST[n.ambiente as 'homologacao' | 'producao']}/v2`
      if (b.acao === 'consultar') {
        const r = await fetch(`${base}/nfce/${encodeURIComponent(n.ref)}?completa=0`, { headers: { Authorization: cfg.auth } })
        const j = await r.json()
        return resp({ nota: await salvarResposta(n.id, n.ambiente, j) })
      }
      const just = String(b.justificativa || '').trim()
      if (just.length < 15 || just.length > 255) return erro('A justificativa precisa ter entre 15 e 255 caracteres.')
      const r = await fetch(`${base}/nfce/${encodeURIComponent(n.ref)}`, { method: 'DELETE', headers: { Authorization: cfg.auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ justificativa: just }) })
      const j = await r.json()
      const extra = j.status === 'cancelado' ? { cancelada_em: new Date().toISOString(), motivo_cancelamento: just } : {}
      const atual = { ...n.resposta, ...j, status: j.status === 'cancelado' ? 'cancelado' : n.status }
      return resp({ nota: await salvarResposta(n.id, n.ambiente, { ...atual, mensagem_sefaz: j.mensagem_sefaz || j.mensagem }, extra) })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    return erro((e as Error).message, 500)
  }
})
