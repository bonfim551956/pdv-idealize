import { supabase } from './supabase'

// Chama a função nfce (Focus NFe). Os tokens ficam no servidor; o navegador só manda a ação.
export async function nfce(body) {
  const { data, error } = await supabase.functions.invoke('nfce', { body })
  if (error) {
    let msg = error.message
    try { const j = await error.context?.json?.(); if (j?.erro) msg = j.erro } catch { /* mantém msg */ }
    throw new Error(msg)
  }
  if (data?.erro) throw new Error(data.erro)
  return data
}

export const STATUS_NF = {
  processando: { rotulo: 'Processando', tom: 'bg-warn-soft text-warn' },
  processando_autorizacao: { rotulo: 'Processando', tom: 'bg-warn-soft text-warn' },
  autorizado: { rotulo: 'Autorizada', tom: 'bg-ok-soft text-ok' },
  erro_autorizacao: { rotulo: 'Rejeitada', tom: 'bg-danger-soft text-danger' },
  denegado: { rotulo: 'Denegada', tom: 'bg-danger-soft text-danger' },
  cancelado: { rotulo: 'Cancelada', tom: 'bg-line/60 text-muted' },
}
