import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Autorização de desconto acima do limite do vendedor: o gerente (Administrativo, Supervisão ou Diretor)
// digita usuário e senha no balcão. A senha é conferida aqui e nunca é guardada.
// Devolve uma autorização de uso único (30 min) que o criar_venda consome.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const AUTORIZA = ['administrativo', 'supervisao', 'diretor']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'pdv' }, auth: { persistSession: false } })

  const tk = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await admin.auth.getUser(tk)
  if (!u?.user) return resp({ erro: 'Sessão expirada. Entre novamente.' }, 401)
  const { data: vendedor } = await admin.from('colaboradores').select('id, ativo, loja_id').eq('auth_user_id', u.user.id).maybeSingle()
  if (!vendedor?.ativo) return resp({ erro: 'Usuário sem acesso.' }, 403)

  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* vazio */ }
  const usuario = String(b.usuario || '').trim().toLowerCase()
  const senha = String(b.senha || '')
  const pct = Math.round(Number(b.pct) * 100) / 100
  if (!usuario || !senha) return resp({ erro: 'Informe usuário e senha do gerente.' })
  if (!(pct > 0 && pct <= 100)) return resp({ erro: 'Percentual de desconto inválido.' })

  // trava de tentativas: 5 senhas erradas em 15 minutos bloqueiam novas tentativas desse vendedor
  const desde = new Date(Date.now() - 15 * 60_000).toISOString()
  const { count: falhas } = await admin.from('registro_acoes').select('id', { count: 'exact', head: true })
    .eq('tipo', 'autorizar_desconto').eq('colaborador_id', vendedor.id).eq('ok', false).gte('criado_em', desde)
  if ((falhas || 0) >= 5) return resp({ erro: 'Muitas tentativas com senha errada. Aguarde 15 minutos ou chame outro gerente.' })
  const registrar = (ok: boolean, detalhe: string) => admin.from('registro_acoes').insert({ tipo: 'autorizar_desconto', colaborador_id: vendedor.id, ok, detalhe })

  // confere a senha do gerente num cliente separado (não mexe na sessão de ninguém)
  const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: login, error } = await auth.auth.signInWithPassword({ email: `${usuario}@pdv.idealize`, password: senha })
  if (error || !login?.user) { await registrar(false, `usuario ${usuario} · ${pct}%`); return resp({ erro: 'Usuário ou senha do gerente incorretos.' }) }
  // não chama signOut: sem escopo ele encerraria as sessões do gerente em todos os aparelhos (o cliente aqui não guarda sessão)

  const { data: g } = await admin.from('colaboradores').select('id, nome, cargo, ativo, loja_id, desconto_max_pct').eq('auth_user_id', login.user.id).maybeSingle()
  if (!g?.ativo || !AUTORIZA.includes(g.cargo)) return resp({ erro: 'Este usuário não pode autorizar desconto. Chame o gerente, a supervisão ou a diretoria.' })
  // administrativo é gerente da própria loja: só autoriza venda da loja dele
  if (g.cargo === 'administrativo' && g.loja_id !== vendedor.loja_id) return resp({ erro: `${g.nome.split(' ')[0]} é gerente de outra loja. Chame o gerente desta loja, a supervisão ou a diretoria.` })
  if (g.desconto_max_pct != null && pct > Number(g.desconto_max_pct) + 0.01) {
    return resp({ erro: `${g.nome.split(' ')[0]} pode autorizar até ${String(g.desconto_max_pct).replace('.', ',')}%. Chame a supervisão ou a diretoria.` })
  }

  const { data: a, error: e2 } = await admin.from('autorizacoes_desconto').insert({ gerente_id: g.id, vendedor_id: vendedor.id, pct }).select('id').single()
  if (e2) return resp({ erro: 'Não foi possível registrar a autorização. Tente de novo.' }, 500)
  await registrar(true, `gerente ${g.nome} · ${pct}%`)
  return resp({ autorizacao_id: a.id, gerente: g.nome, pct })
})
