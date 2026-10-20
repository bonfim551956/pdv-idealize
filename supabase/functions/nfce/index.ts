import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// NFC-e (cupom, modelo 65) e NF-e (modelo 55) pela Focus NFe. Emitir, consultar, cancelar e configurar a loja.
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

  const configDe = async (lojaId: string, ambienteNota?: string) => {
    const { data: f } = await db.from('lojas_fiscal').select('*').eq('loja_id', lojaId).maybeSingle()
    const { data: l } = await db.from('lojas').select('id, nome, cnpj').eq('id', lojaId).maybeSingle()
    if (!f || !l) throw new Error('Loja sem configuração fiscal.')
    const amb = (ambienteNota || f.ambiente) as 'homologacao' | 'producao'
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

    // ---------- Arquivos para a contabilidade: backups mensais da Focus (ZIP de XMLs e DANFEs) ----------
    if (b.acao === 'backups') {
      if (!podeLoja(b.loja_id)) return erro('Loja sem acesso.', 403)
      const { data: f } = await db.from('lojas_fiscal').select('token_producao, token_homologacao').eq('loja_id', b.loja_id).maybeSingle()
      const amb: 'producao' | 'homologacao' = f?.token_producao ? 'producao' : 'homologacao'
      const cfg = await configDe(b.loja_id, amb)
      const r = await fetch(`${cfg.base}/backups/${so(cfg.l.cnpj)}.json`, { headers: { Authorization: cfg.auth } })
      const j = await r.json().catch(() => null)
      if (r.status === 403) return erro('A Focus não liberou os backups para este token. No painel da Focus, confira se a empresa tem acesso aos backups (ou use o token principal da conta).')
      if (!r.ok || !Array.isArray(j)) return erro(`Focus NFe não devolveu os backups agora (${r.status}).`, 502)
      const url = (c?: string) => (c ? (c.startsWith('http') ? c : HOST[amb] + c) : null)
      return resp({ ambiente: amb, meses: j.map((x: any) => ({ mes: x.mes, xmls: url(x.xmls), danfes: url(x.danfes) })).sort((a: any, z: any) => String(z.mes).localeCompare(String(a.mes))) })
    }

    // ---------- Emitir ----------
    if (b.acao === 'emitir') {
      const { data: v } = await db.from('vendas').select('id, numero, status, loja_id, cliente_id, total_liquido').eq('id', b.venda_id).maybeSingle()
      if (!v) return erro('Venda não encontrada.', 404)
      if (!podeLoja(v.loja_id)) return erro('Venda de outra loja.', 403)
      if (v.status !== 'confirmada') return erro('Só venda confirmada emite nota.')
      const clienteId: string = b.cliente_id || v.cliente_id
      const modelo: 'nfce' | 'nfe' = b.modelo === 'nfe' ? 'nfe' : 'nfce'
      // uma nota ativa por cliente na venda (NFC-e ou NF-e: a mesma venda não pode sair em duas notas)
      const { data: ja } = await db.from('notas_fiscais').select('id, modelo').eq('venda_id', v.id).eq('cliente_id', clienteId).in('status', ['autorizado', 'processando_autorizacao', 'processando']).limit(1)
      if (ja?.length) return erro(`Já existe ${ja[0].modelo === 'nfe' ? 'NF-e' : 'NFC-e'} ativa para este cliente nesta venda. Cancele antes de emitir outra.`)
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

      const ref = `pdv-${modelo === 'nfe' ? 'e' : ''}${v.numero}-${so(cli?.documento).slice(-4) || 'x'}-${Date.now().toString(36)}`
      const payload: Record<string, unknown> = {
        cnpj_emitente: so(cfg.l.cnpj), data_emissao: new Date().toISOString(),
        natureza_operacao: 'VENDA AO CONSUMIDOR', presenca_comprador: '1', modalidade_frete: '9', local_destino: '1',
        items, formas_pagamento: formas,
        informacoes_adicionais_contribuinte: `Venda ${v.numero} - PDV Óticas Idealize`,
      }
      let destinatario: Record<string, unknown> | null = null
      if (modelo === 'nfce') {
        const cpf = so(cli?.documento)
        if (cpf.length === 11) { payload.cpf_destinatario = cpf; if (cli?.nome) payload.nome_destinatario = cli.nome; destinatario = { documento: cpf, nome: cli?.nome } }
      } else {
        // NF-e: destinatário identificado com endereço. Padrão = o próprio cliente (CPF); ou outro (ex.: CNPJ da empresa dele)
        const o = b.destinatario || {}
        let d: Record<string, any>
        if (o.documento) {
          d = { documento: so(o.documento), nome: String(o.nome || '').trim(), ie: so(o.ie), indicador_ie: Number(o.indicador_ie) || 9,
            cep: so(o.cep), logradouro: o.logradouro, numero: o.numero, complemento: o.complemento, bairro: o.bairro, cidade: o.cidade, uf: String(o.uf || '').toUpperCase() }
        } else {
          const { data: end } = await db.from('cliente_enderecos').select('cep, logradouro, numero, complemento, bairro, cidade, uf').eq('cliente_id', clienteId).limit(1).maybeSingle()
          d = { documento: so(cli?.documento), nome: cli?.nome, ie: '', indicador_ie: 9, ...(end || {}), cep: so(end?.cep), uf: String(end?.uf || '').toUpperCase() }
        }
        if (![11, 14].includes(String(d.documento).length)) return erro('NF-e precisa de CPF ou CNPJ do destinatário.')
        if (!d.nome) return erro('NF-e precisa do nome/razão social do destinatário.')
        if (!(d.cep && d.logradouro && d.numero && d.bairro && d.cidade && d.uf)) return erro('NF-e precisa do endereço completo do destinatário (CEP, rua, número, bairro, cidade e UF). Complete a ficha do cliente.')
        if (d.indicador_ie === 1 && !d.ie) return erro('Contribuinte do ICMS precisa da inscrição estadual.')
        const interestadual = d.uf !== 'SP'
        const contribuinte = d.indicador_ie === 1
        Object.assign(payload, {
          tipo_documento: 1, finalidade_emissao: 1, consumidor_final: contribuinte ? 0 : 1,
          natureza_operacao: contribuinte ? 'VENDA DE MERCADORIA' : 'VENDA AO CONSUMIDOR',
          local_destino: interestadual ? 2 : 1,
          [String(d.documento).length === 14 ? 'cnpj_destinatario' : 'cpf_destinatario']: d.documento,
          nome_destinatario: String(d.nome).slice(0, 60),
          indicador_inscricao_estadual_destinatario: d.indicador_ie,
          ...(d.indicador_ie === 1 ? { inscricao_estadual_destinatario: d.ie } : {}),
          logradouro_destinatario: d.logradouro, numero_destinatario: d.numero, bairro_destinatario: d.bairro,
          ...(d.complemento ? { complemento_destinatario: d.complemento } : {}),
          municipio_destinatario: d.cidade, uf_destinatario: d.uf, cep_destinatario: d.cep, pais_destinatario: 'Brasil',
        })
        // fora de SP: 6102 para contribuinte, 6108 para não contribuinte (confirmar com o contador)
        if (interestadual) for (const it of items as any[]) it.cfop = contribuinte ? '6102' : '6108'
        destinatario = d
      }
      if (cfg.f.serie) payload.serie = String(cfg.f.serie)

      const { data: nota, error: en } = await db.from('notas_fiscais').insert({
        venda_id: v.id, loja_id: v.loja_id, cliente_id: clienteId, ref, modelo, ambiente: cfg.amb, status: 'processando', valor: totalNota, emitida_por: eu.id, destinatario,
      }).select('id').single()
      if (en) return erro(en.message, 500)
      const r = await fetch(`${cfg.base}/${modelo}?ref=${encodeURIComponent(ref)}`, { method: 'POST', headers: { Authorization: cfg.auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await r.json().catch(() => ({ status: 'erro_autorizacao', mensagem: `Focus NFe respondeu ${r.status}` }))
      if (!r.ok && !j.status) j.status = 'erro_autorizacao'
      return resp({ nota: await salvarResposta(nota.id, cfg.amb, j) })
    }

    // ---------- Consultar / Cancelar ----------
    if (b.acao === 'consultar' || b.acao === 'cancelar') {
      const { data: n } = await db.from('notas_fiscais').select('*').eq('id', b.nota_id).maybeSingle()
      if (!n) return erro('Nota não encontrada.', 404)
      if (!podeLoja(n.loja_id)) return erro('Nota de outra loja.', 403)
      const cfg = await configDe(n.loja_id, n.ambiente)
      const base = `${cfg.base}/${n.modelo === 'nfe' ? 'nfe' : 'nfce'}`
      if (b.acao === 'consultar') {
        const r = await fetch(`${base}/${encodeURIComponent(n.ref)}?completa=0`, { headers: { Authorization: cfg.auth } })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || !j.status) return erro(j.mensagem || `Focus NFe não respondeu agora (${r.status}). Tente de novo.`, 502)
        return resp({ nota: await salvarResposta(n.id, n.ambiente, j) })
      }
      const just = String(b.justificativa || '').trim()
      if (just.length < 15 || just.length > 255) return erro('A justificativa precisa ter entre 15 e 255 caracteres.')
      const r = await fetch(`${base}/${encodeURIComponent(n.ref)}`, { method: 'DELETE', headers: { Authorization: cfg.auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ justificativa: just }) })
      const j = await r.json().catch(() => ({}))
      if (j.status !== 'cancelado') return erro(`Cancelamento não aceito: ${j.mensagem_sefaz || j.mensagem || `Focus respondeu ${r.status}`}`)
      const extra = j.status === 'cancelado' ? { cancelada_em: new Date().toISOString(), motivo_cancelamento: just } : {}
      const atual = { ...n.resposta, ...j, status: j.status === 'cancelado' ? 'cancelado' : n.status }
      return resp({ nota: await salvarResposta(n.id, n.ambiente, { ...atual, mensagem_sefaz: j.mensagem_sefaz || j.mensagem }, extra) })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    return erro((e as Error).message, 500)
  }
})
