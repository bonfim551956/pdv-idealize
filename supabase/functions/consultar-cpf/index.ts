import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Consulta CPF v3 do Serpro (a única ativa desde 20/09/2026).
// Exige CPF + data de nascimento; devolve nome, nome social e situação na Receita.
// Se a data não bate com a Receita, a resposta é DATA_NASCIMENTO_DIVERGENTE (a consulta é cobrada mesmo assim).
// Chaves só aqui (segredos SERPRO_CONSUMER_KEY / SERPRO_CONSUMER_SECRET). Resultado fica em cache por 180 dias.
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
// aceita aaaa-mm-dd ou dd/mm/aaaa; devolve ISO
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
  const nasc = dataISO(body.nascimento)
  if (!nasc) return resp({ erro: 'Informe a data de nascimento para consultar a Receita.', precisa_nascimento: true }, 400)

  // 1) cache (só vale se a data de nascimento for a mesma já confirmada)
  const { data: c } = await admin.from('cpf_consultas').select('nome, nome_social, nascimento, situacao, consultado_em').eq('cpf', cpf).maybeSingle()
  if (c && c.nascimento === nasc && Date.now() - new Date(c.consultado_em).getTime() < CACHE_DIAS * 864e5) {
    return resp({ configurado: true, nome: c.nome, nome_social: c.nome_social, nascimento: c.nascimento, situacao: c.situacao, confere: true, cache: true })
  }

  // 2) Serpro
  const ambiente = (Deno.env.get('SERPRO_AMBIENTE') || 'producao').toLowerCase()
  const key = Deno.env.get('SERPRO_CONSUMER_KEY'), secret = Deno.env.get('SERPRO_CONSUMER_SECRET')
  if (ambiente !== 'trial' && (!key || !secret)) return resp({ configurado: false, erro: 'Consulta de CPF ainda não configurada.' })
  try {
    const token = ambiente === 'trial' ? TRIAL_TOKEN : await tokenSerpro(key!, secret!)
    const base = `${GATEWAY}/${ambiente === 'trial' ? 'consulta-cpf-df-trial' : 'consulta-cpf-df'}/v3`
    const r = await fetch(`${base}/cpf/${cpf}/${paraSerpro(nasc)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (r.status === 401) tokenCache = null
    const j = await r.json().catch(() => ({}))
    if (r.status === 404 && j.erro === 'DATA_NASCIMENTO_DIVERGENTE') return resp({ configurado: true, confere: false, erro: 'A data de nascimento não confere com a Receita. Confira com o cliente.' })
    if (r.status === 404) return resp({ configurado: true, confere: false, erro: 'CPF não encontrado na Receita.' })
    if (r.status === 400) return resp({ configurado: true, erro: j.erroDescricao || 'Dados inválidos para a Receita.' })
    if (r.status === 429) return resp({ configurado: true, erro: 'Limite de consultas atingido no momento. Preencha manualmente.' })
    if (!r.ok) return resp({ configurado: true, erro: `Receita indisponível agora (${r.status}). Preencha manualmente.` })
    const out = {
      nome: j.nome ? String(j.nome).toUpperCase() : null,
      nome_social: j.nomeSocial ? String(j.nomeSocial).toUpperCase() : null,
      nascimento: nasc,
      situacao: j.situacao?.descricao ? String(j.situacao.descricao) : null,
    }
    await admin.from('cpf_consultas').upsert({ cpf, ...out, fonte: ambiente === 'trial' ? 'serpro-trial' : 'serpro-v3', consultado_em: new Date().toISOString(), consultado_por: eu.id })
    return resp({ configurado: true, confere: true, ...out })
  } catch (e) {
    return resp({ configurado: true, erro: (e as Error).message })
  }
})
