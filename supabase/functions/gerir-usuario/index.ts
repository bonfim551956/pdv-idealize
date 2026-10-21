import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Gestão de usuários do PDV. Só aqui a chave de serviço é usada; a hierarquia de perfis é aplicada antes de qualquer alteração.
// Administrativo é gerente da própria loja: só cria e gere usuários (Comercial) da loja dele.
const DOMINIO = 'pdv.idealize'
const NIVEL: Record<string, number> = { comercial: 1, administrativo: 2, supervisao: 3, diretor: 4 }
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const erro = (mensagem: string, status = 400) => resp({ erro: mensagem }, status)

// Quem pode atribuir/gerir qual perfil: abaixo do próprio nível; diretor gere todos
const podeGerir = (meu: number, alvo: number) => (meu === 4 ? true : alvo < meu)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return erro('Método não permitido', 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'pdv' },
    auth: { persistSession: false },
  })

  // 1) Quem está pedindo
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u, error: eu } = await admin.auth.getUser(token)
  if (eu || !u?.user) return erro('Sessão inválida. Entre novamente.', 401)
  const { data: eu2 } = await admin.from('colaboradores').select('id, cargo, ativo, loja_id').eq('auth_user_id', u.user.id).maybeSingle()
  if (!eu2 || !eu2.ativo) return erro('Seu usuário não está ativo.', 403)
  const meuNivel = NIVEL[eu2.cargo] ?? 0
  if (meuNivel < 2) return erro('Seu perfil não pode gerenciar usuários.', 403)
  const soMinhaLoja = meuNivel < 3
  const lojaPermitida = (lojaId: string | null | undefined) => !soMinhaLoja || lojaId === eu2.loja_id

  let body: Record<string, any>
  try { body = await req.json() } catch { return erro('Requisição inválida.') }
  const { acao } = body

  const log = (colaborador_id: string, detalhes: unknown) =>
    admin.from('usuarios_log').insert({ feito_por: eu2.id, colaborador_id, acao, detalhes })

  // Carrega o colaborador alvo (para editar/desativar/senha) e confere hierarquia e loja
  const carregarAlvo = async (id: string) => {
    const { data } = await admin.from('colaboradores').select('id, nome, usuario, cargo, loja_id, ativo, auth_user_id').eq('id', id).maybeSingle()
    if (!data) throw new Error('Usuário não encontrado.')
    if (!podeGerir(meuNivel, NIVEL[data.cargo] ?? 0)) throw new Error('Seu perfil não pode alterar esse usuário.')
    if (!lojaPermitida(data.loja_id)) throw new Error('Esse usuário é de outra loja.')
    return data
  }

  try {
    if (acao === 'criar') {
      const nome = String(body.nome || '').trim()
      const usuario = String(body.usuario || '').trim().toLowerCase()
      const senha = String(body.senha || '')
      const cargo = String(body.cargo || '')
      const loja_id = String(body.loja_id || '')
      if (nome.length < 3) return erro('Informe o nome completo.')
      if (!/^[a-z0-9._]{3,30}$/.test(usuario)) return erro('Usuário: 3 a 30 caracteres, só letras minúsculas, números, ponto ou _.')
      if (senha.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.')
      if (!NIVEL[cargo]) return erro('Perfil inválido.')
      if (!podeGerir(meuNivel, NIVEL[cargo])) return erro('Seu perfil não pode criar usuários com esse perfil.')
      if (!loja_id) return erro('Escolha a loja.')
      if (!lojaPermitida(loja_id)) return erro('Você só cria usuários da sua loja.', 403)

      const { data: existe } = await admin.from('colaboradores').select('id').eq('usuario', usuario).maybeSingle()
      if (existe) return erro('Esse nome de usuário já está em uso.')

      const { data: col, error: ec } = await admin.from('colaboradores').insert({ nome, usuario, cargo, loja_id, ativo: true }).select('id').single()
      if (ec) return erro('Não foi possível criar o cadastro: ' + ec.message)

      const { data: novo, error: ea } = await admin.auth.admin.createUser({ email: `${usuario}@${DOMINIO}`, password: senha, email_confirm: true })
      if (ea) {
        await admin.from('colaboradores').delete().eq('id', col.id)
        return erro(/already/i.test(ea.message) ? 'Já existe um login com esse usuário.' : 'Não foi possível criar o login: ' + ea.message)
      }
      // garante o vínculo (o gatilho do banco também faz isso)
      await admin.from('colaboradores').update({ auth_user_id: novo.user.id }).eq('id', col.id)
      await log(col.id, { nome, usuario, cargo, loja_id })
      return resp({ ok: true, id: col.id })
    }

    if (acao === 'editar') {
      const alvo = await carregarAlvo(body.id)
      const patch: Record<string, unknown> = {}
      if (body.nome !== undefined) {
        const nome = String(body.nome).trim()
        if (nome.length < 3) return erro('Informe o nome completo.')
        patch.nome = nome
      }
      if (body.cargo !== undefined) {
        if (!NIVEL[body.cargo]) return erro('Perfil inválido.')
        if (!podeGerir(meuNivel, NIVEL[body.cargo])) return erro('Seu perfil não pode atribuir esse perfil.')
        if (alvo.id === eu2.id && body.cargo !== alvo.cargo) return erro('Você não pode mudar o seu próprio perfil.')
        patch.cargo = body.cargo
      }
      if (body.loja_id !== undefined) {
        if (!lojaPermitida(body.loja_id)) return erro('Você só pode deixar o usuário na sua loja.', 403)
        patch.loja_id = body.loja_id
      }
      const { error } = await admin.from('colaboradores').update(patch).eq('id', alvo.id)
      if (error) return erro(error.message)
      await log(alvo.id, { antes: { nome: alvo.nome, cargo: alvo.cargo, loja_id: alvo.loja_id }, depois: patch })
      return resp({ ok: true })
    }

    if (acao === 'senha') {
      const alvo = await carregarAlvo(body.id)
      const senha = String(body.senha || '')
      if (senha.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.')
      if (!alvo.auth_user_id) return erro('Esse usuário não tem login vinculado.')
      const { error } = await admin.auth.admin.updateUserById(alvo.auth_user_id, { password: senha })
      if (error) return erro(error.message)
      await log(alvo.id, { redefinida: true })
      return resp({ ok: true })
    }

    if (acao === 'ativar' || acao === 'desativar') {
      const alvo = await carregarAlvo(body.id)
      if (alvo.id === eu2.id) return erro('Você não pode desativar o seu próprio usuário.')
      const ativo = acao === 'ativar'
      const { error } = await admin.from('colaboradores').update({ ativo }).eq('id', alvo.id)
      if (error) return erro(error.message)
      // bloqueia o login de quem foi desativado e encerra as sessões abertas
      if (alvo.auth_user_id) await admin.auth.admin.updateUserById(alvo.auth_user_id, { ban_duration: ativo ? 'none' : '876000h' })
      await log(alvo.id, { ativo })
      return resp({ ok: true })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    return erro((e as Error).message, 403)
  }
})
