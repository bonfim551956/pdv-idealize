// Perfis de acesso do PDV. A mesma regra é aplicada no banco (RLS) e na função gerir-usuario.
export const PERFIS = {
  comercial: { nivel: 1, nome: 'Comercial', descricao: 'Lança vendas, recebe pagamentos e vê vendas e relatórios da própria loja.' },
  administrativo: { nivel: 2, nome: 'Administrativo', descricao: 'Vendas e relatórios de todas as lojas. Cria usuários do perfil Comercial.' },
  supervisao: { nivel: 3, nome: 'Supervisão', descricao: 'Acesso a tudo, incluindo lentes e preços. Cria usuários até Administrativo.' },
  diretor: { nivel: 4, nome: 'Diretor / Proprietário', descricao: 'Acesso total. Cria e gerencia usuários de todos os perfis.' },
}

export function permissoes(cargo) {
  const nivel = PERFIS[cargo]?.nivel ?? 0
  return {
    nivel,
    vender: nivel >= 1,
    receber: nivel >= 1,
    verVendas: nivel >= 1,
    relatorios: nivel >= 1,
    todasLojas: nivel >= 2,
    usuarios: nivel >= 2,
    produtos: nivel >= 3,
  }
}

// Perfis que quem está logado pode atribuir ou gerenciar
export function perfisGerenciaveis(meuNivel) {
  return Object.entries(PERFIS).filter(([, p]) => (meuNivel === 4 ? true : p.nivel < meuNivel)).map(([k]) => k)
}
