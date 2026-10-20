import { supabase, buscarTodos } from './supabase'

/*
  Catálogo de produtos da Nova OS (≈3.200 itens). Fica em memória durante o uso do PDV:
  voltar à Nova OS não baixa tudo de novo. Antes de reaproveitar, confere com uma consulta
  pequena (quantidade + última alteração) se algo mudou em Lentes e preços.
*/
let cache = null // { versao, dados }

async function versaoAtual() {
  const { data, count, error } = await supabase.from('produtos').select('updated_at', { count: 'exact' })
    .eq('ativo', true).order('updated_at', { ascending: false }).limit(1)
  if (error) return null
  return `${count}|${data?.[0]?.updated_at || ''}`
}

export async function carregarCatalogo() {
  const versao = await versaoAtual()
  if (cache && versao && cache.versao === versao) return { data: cache.dados, error: null }
  const r = await buscarTodos(() => supabase.from('produtos').select('id, sku, nome, tipo, preco, atributos').eq('ativo', true).order('nome').order('id'))
  if (!r.error && versao) cache = { versao, dados: r.data }
  return r
}

export const limparCatalogo = () => { cache = null }
