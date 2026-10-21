// Perfis de acesso do PDV. A mesma regra é aplicada no banco (RLS) e na função gerir-usuario.
export const PERFIS = {
  comercial: { nivel: 1, nome: 'Comercial', descricao: 'Lança vendas, recebe pagamentos e vê vendas e relatórios da própria loja. Desconto até 15% (acima disso, o gerente autoriza).' },
  administrativo: { nivel: 2, nome: 'Administrativo', descricao: 'Vendas, relatórios e usuários Comercial da própria loja. Não dá nem autoriza desconto.' },
  gerente: { nivel: 3, nome: 'Gerente', descricao: 'Gerente da loja: tudo do Administrativo, cadastra Comercial e Administrativo e autoriza desconto até 25%.' },
  supervisao: { nivel: 4, nome: 'Supervisão', descricao: 'Todas as lojas, incluindo lentes e preços. Cria usuários até Gerente e define limites de desconto.' },
  diretor: { nivel: 5, nome: 'Diretor / Proprietário', descricao: 'Acesso total, incluindo o cadastro fiscal. Cria e gerencia usuários de todos os perfis.' },
}

export function permissoes(cargo) {
  const nivel = PERFIS[cargo]?.nivel ?? 0
  return {
    nivel,
    vender: nivel >= 1,
    receber: nivel >= 1,
    verVendas: nivel >= 1,
    relatorios: nivel >= 1,
    todasLojas: nivel >= 4, // administrativo e gerente ficam na própria loja
    usuarios: nivel >= 2,
    produtos: nivel >= 4,
    autorizaDesconto: nivel >= 3, // gerente (loja dele), supervisão e diretor
    fiscalConfig: nivel >= 5, // cadastro fiscal da loja (Focus NFe): só proprietário
  }
}

// Perfis que quem está logado pode atribuir ou gerenciar
export function perfisGerenciaveis(meuNivel) {
  return Object.entries(PERFIS).filter(([, p]) => (meuNivel === 5 ? true : p.nivel < meuNivel)).map(([k]) => k)
}
