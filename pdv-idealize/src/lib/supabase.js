import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_KEY

// Sem as variáveis o app não consegue falar com o banco: avisa em vez de ficar em branco
export const CONFIG_FALTANDO = !URL || !KEY

export const supabase = CONFIG_FALTANDO
  ? null
  : createClient(URL, KEY, { db: { schema: 'pdv' } })

// Login só com usuário: o e-mail técnico nunca aparece na tela
export const LOGIN_DOMAIN = 'pdv.idealize'
export const usuarioParaEmail = (u) => `${u.trim().toLowerCase()}@${LOGIN_DOMAIN}`

// Traduz erros do Supabase/Postgres para mensagens de balcão
export function mensagemErro(e) {
  if (!e) return 'Algo deu errado. Tente novamente.'
  const msg = e.message || String(e)
  if (e.code === 'PGRST106' || /schema must be one of/i.test(msg))
    return 'O schema "pdv" não está exposto na API do Supabase (Settings → Data API → Exposed schemas).'
  if (/Invalid login credentials/i.test(msg)) return 'Usuário ou senha incorretos.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.'
  if (/row-level security|permission denied/i.test(msg)) return 'Seu usuário não tem permissão para essa ação.'
  if (/duplicate key.*documento/i.test(msg)) return 'Já existe um cliente com esse documento.'
  if (/duplicate key.*sku/i.test(msg)) return 'Já existe um produto com esse SKU.'
  if (e.code === '23514') return 'Algum valor está fora do permitido. Confira os campos destacados.'
  return msg
}
