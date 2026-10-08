import { NavLink } from 'react-router-dom'
import { ReceiptText, PlusCircle, Glasses, LogOut, Store, BarChart3, Users } from 'lucide-react'
import { PERFIS } from '../lib/permissoes'
import { useAuth } from '../lib/auth'
import { cx } from './ui'

export function Logo({ branca, className }) {
  return <img src={branca ? '/logo-branca.png' : '/logo.png'} alt="Óticas Idealize" className={cx('h-auto select-none', className)} draggable={false} />
}

export default function Layout({ children }) {
  const { perfil, perm, sair } = useAuth()
  const links = [
    { to: '/', label: 'Vendas', icon: ReceiptText, end: true },
    { to: '/nova-venda', label: 'Nova venda', icon: PlusCircle },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
    ...(perm.produtos ? [{ to: '/produtos', label: 'Lentes e preços', icon: Glasses }] : []),
    ...(perm.usuarios ? [{ to: '/usuarios', label: 'Usuários', icon: Users }] : []),
  ]
  const lojaCurta = perfil.loja?.nome?.replace('Óticas Idealize ', '')

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col justify-between border-r border-line bg-surface md:flex">
        <div className="flex flex-col gap-8 p-4">
          <div className="px-2 pt-2"><Logo className="w-44" /></div>
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cx(
                    'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-brand-soft text-brand before:absolute before:inset-y-1.5 before:-left-4 before:w-1 before:rounded-r before:bg-accent'
                      : 'text-muted hover:bg-line/40 hover:text-ink'
                  )
                }
              >
                <l.icon className="h-4 w-4" aria-hidden /> {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-3 border-t border-line p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand font-display text-sm font-bold text-surface">
              {perfil.nome.charAt(0)}
            </span>
            <div className="min-w-0 text-sm leading-tight">
              <p className="truncate font-semibold">{perfil.nome}</p>
              <p className="flex items-center gap-1 text-muted"><Store className="h-3 w-3" aria-hidden /> {lojaCurta} · {PERFIS[perfil.cargo]?.nome}</p>
            </div>
          </div>
          <button onClick={sair} className="flex items-center gap-2 text-sm text-muted hover:text-danger">
            <LogOut className="h-4 w-4" aria-hidden /> Sair
          </button>
        </div>
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <Logo className="w-32" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">{lojaCurta}</span>
          <button onClick={sair} aria-label="Sair" className="rounded-md p-2 text-muted hover:text-danger"><LogOut className="h-5 w-5" /></button>
        </div>
      </header>

      <main className="min-w-0 px-4 pb-24 pt-6 sm:px-8 md:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}
            className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-1 border-t-2 py-2 text-xs font-semibold', isActive ? 'border-accent text-brand' : 'border-transparent text-muted')}>
            <l.icon className="h-5 w-5" aria-hidden /> {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
