import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Consulta de CPF para o cadastro de cliente novo.
// 1) Só com o CPF: CPFHub (base privada) devolve nome e data de nascimento.
// 2) Com CPF + nascimento: Serpro Consulta CPF v3 (Receita) confirma e devolve nome, nome social e situação.
//    A v3 (única ativa desde 20/09/2026) não devolve mais a data de nascimento; ela entra como pergunta.
// Quando os dois estão configurados: o CPFHub acha o nascimento e a Serpro confirma na Receita.
// Segredos: CPFHUB_API_KEY, SERPRO_CONSUMER_KEY, SERPRO_CONSUMER_SECRET (opcional SERPRO_AMBIENTE=trial). Cache de 180 dias.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const GATEWAY = 'https://gateway.apiserpro.serpro.gov.br'
const TRIAL_TOKEN = '06aef429-a981-3ec5-a1f8-71d38d86481e' // chave pública do ambiente Trial (dados fictícios) publicada pelo Serpro
const CACHE_DIAS = 180

function cpfValido(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
// aceita aaaa-mm-dd, dd/mm/aaaa ou ddmmaaaa; devolve ISO
function dataISO(v?: unknown) {
  const s = String(v ?? '').trim()
  let iso = ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) iso = s.slice(0, 10)
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) iso = `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`
  else if (/^\d{8}$/.test(s)) iso = `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`
  const d = new Date(iso + 'T12:00:00Z')
  if (!iso || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d > new Date()) return null
  return iso
}
const paraSerpro = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}` // ddMMaaaa

let tokenCache: { valor: string; expira: number } | null = null
async function tokenSerpro(key: string, secret: string) {
  if (tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache.valor
  const r = await fetch(`${GATEWAY}/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${key}:${secret}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!r.ok) throw new Error(`Serpro recusou as credenciais (${r.status}). Confira os segredos no Supabase.`)
  const j = await r.json()
  tokenCache = { valor: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3000) * 1000 }
  return tokenCache.valor
}

type Serpro = { ok: true; nome: string | null; nome_social: string | null; situacao: string | null } | { ok: false; divergente?: boolean; erro: string }
async function consultaSerpro(cpf: string, nasc: string): Promise<Serpro | null> {
  const ambiente = (Deno.env.get('SERPRO_AMBIENTE') || 'producao').toLowerCase()
  const key = Deno.env.get('SERPRO_CONSUMER_KEY'), secret = Deno.env.get('SERPRO_CONSUMER_SECRET')
  if (ambiente !== 'trial' && (!key || !secret)) return null
  const token = ambiente === 'trial' ? TRIAL_TOKEN : await tokenSerpro(key!, secret!)
  const base = `${GATEWAY}/${ambiente === 'trial' ? 'consulta-cpf-df-trial' : 'consulta-cpf-df'}/v3`
  const r = await fetch(`${base}/cpf/${cpf}/${paraSerpro(nasc)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  if (r.status === 401) tokenCache = null
  const j = await r.json().catch(() => ({}))
  if (r.status === 404 && j.erro === 'DATA_NASCIMENTO_DIVERGENTE') return { ok: false, divergente: true, erro: 'A data de nascimento não confere com a Receita. Confira com o cliente.' }
  if (r.status === 404) return { ok: false, erro: 'CPF não encontrado na Receita.' }
  if (r.status === 400) return { ok: false, erro: j.erroDescricao || 'Dados inválidos para a Receita.' }
  if (r.status === 429) return { ok: false, erro: 'Limite de consultas da Receita atingido no momento.' }
  if (!r.ok) return { ok: false, erro: `Receita indisponível agora (${r.status}).` }
  return {
    ok: true,
    nome: j.nome ? String(j.nome).toUpperCase() : null,
    nome_social: j.nomeSocial ? String(j.nomeSocial).toUpperCase() : null,
    situacao: j.situacao?.descricao ? String(j.situacao.descricao) : null,
  }
}

async function consultaCpfHub(cpf: string) {
  const key = Deno.env.get('CPFHUB_API_KEY')
  if (!key) return null
  const r = await fetch(`https://api.cpfhub.io/cpf/${cpf}`, { headers: { 'x-api-key': key, Accept: 'application/json' } })
  if (r.status === 404) return { achou: false as const }
  const j = await r.json().catch(() => ({}))
  if (r.status === 401 || r.status === 403) throw new Error('CPFHub recusou a chave. Confira o segredo CPFHUB_API_KEY.')
  if (r.status === 402 || r.status === 429) throw new Error('Créditos do CPFHub acabaram ou limite atingido.')
  if (!r.ok || !j?.data) throw new Error(`Base de CPF indisponível agora (${r.status}).`)
  return { achou: true as const, nome: String(j.data.nameUpper || j.data.name || '').toUpperCase() || null, nascimento: dataISO(j.data.birthDate) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'pdv' }, auth: { persistSession: false } })

  // só colaborador ativo do PDV consulta
  const tk = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await admin.auth.getUser(tk)
  if (!u?.user) return resp({ erro: 'Sessão expirada. Entre novamente.' }, 401)
  const { data: eu } = await admin.from('colaboradores').select('id, ativo').eq('auth_user_id', u.user.id).maybeSingle()
  if (!eu?.ativo) return resp({ erro: 'Usuário sem acesso.' }, 403)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* vazio */ }
  const cpf = String(body.cpf || '').replace(/\D/g, '')
  if (!cpfValido(cpf)) return resp({ erro: 'CPF inválido.' }, 400)
  let nasc = body.nascimento ? dataISO(body.nascimento) : null
  if (body.nascimento && !nasc) return resp({ configurado: true, erro: 'Data de nascimento inválida.' })

  const temSerpro = (Deno.env.get('SERPRO_AMBIENTE') || '').toLowerCase() === 'trial' || !!(Deno.env.get('SERPRO_CONSUMER_KEY') && Deno.env.get('SERPRO_CONSUMER_SECRET'))
  const temHub = !!Deno.env.get('CPFHUB_API_KEY')

  // 1) cache: sem data, qualquer resultado salvo serve; com data, só se for a mesma
  const { data: c } = await admin.from('cpf_consultas').select('nome, nome_social, nascimento, situacao, fonte, consultado_em').eq('cpf', cpf).maybeSingle()
  if (c && Date.now() - new Date(c.consultado_em).getTime() < CACHE_DIAS * 864e5 && (!nasc || c.nascimento === nasc)) {
    return resp({ configurado: true, nome: c.nome, nome_social: c.nome_social, nascimento: c.nascimento, situacao: c.situacao, confere: String(c.fonte || '').includes('serpro'), fonte: c.fonte, cache: true })
  }

  try {
    let nome: string | null = null
    let fonte = ''
    // 2) só CPF: busca nome e nascimento na base do CPFHub
    if (!nasc) {
      if (!temHub) return resp({ configurado: temSerpro, precisa_nascimento: true })
      const h = await consultaCpfHub(cpf)
      if (!h?.achou || !h.nascimento) return resp({ configurado: true, precisa_nascimento: true, erro: 'CPF não encontrado na base. Pergunte a data de nascimento ao cliente.' })
      nasc = h.nascimento; nome = h.nome; fonte = 'cpfhub'
    }

    // 3) confirma na Receita (Serpro v3) com CPF + nascimento
    const s = temSerpro ? await consultaSerpro(cpf, nasc!) : null
    if (s && !s.ok) {
      if (fonte === 'cpfhub' && s.divergente) {
        // a base privada trouxe uma data que a Receita não confirma: devolve como sugestão, sem gravar
        return resp({ configurado: true, nome, nascimento: nasc, confere: false, fonte, erro: 'A data de nascimento encontrada não confere com a Receita. Confirme com o cliente.' })
      }
      if (fonte === 'cpfhub') return resp({ configurado: true, nome, nascimento: nasc, confere: false, fonte, erro: `${s.erro} Dados da base sem confirmação: confira com o cliente.` })
      return resp({ configurado: true, confere: false, erro: s.erro })
    }
    if (!s && !fonte) return resp({ configurado: false, erro: 'Consulta de CPF ainda não configurada.' })

    const out = {
      nome: (s?.ok && s.nome) || nome,
      nome_social: s?.ok ? s.nome_social : null,
      nascimento: nasc,
      situacao: s?.ok ? s.situacao : null,
    }
    fonte = [fonte, s?.ok ? 'serpro-v3' : ''].filter(Boolean).join('+')
    await admin.from('cpf_consultas').upsert({ cpf, ...out, fonte, consultado_em: new Date().toISOString(), consultado_por: eu.id })
    return resp({ configurado: true, confere: !!s?.ok, fonte, ...out })
  } catch (e) {
    return resp({ configurado: true, erro: (e as Error).message })
  }
})
