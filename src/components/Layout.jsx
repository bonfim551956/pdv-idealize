import { NavLink } from 'react-router-dom'
import { ReceiptText, PlusCircle, Glasses, LogOut } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { cx } from './ui'

function Marca() {
  // Duas lentes: OD (azul) e OE (cobre) — a mesma codificação de cor usada na receita
  return (
    <div className="flex items-center gap-3">
      <svg width="40" height="20" viewBox="0 0 40 20" aria-hidden>
        <circle cx="10" cy="10" r="8" fill="none" stroke="#0D5C75" strokeWidth="3" />
        <circle cx="30" cy="10" r="8" fill="none" stroke="#8A4B1F" strokeWidth="3" />
        <path d="M18 9 Q20 6 22 9" fill="none" stroke="#17232D" strokeWidth="2" />
      </svg>
      <div className="leading-tight">
        <p className="text-base font-bold">Idealize</p>
        <p className="text-xs text-muted">Ponto de venda</p>
      </div>
    </div>
  )
}

export default function Layout({ children }) {
  const { perfil, isAdmin, sair } = useAuth()
  const links = [
    { to: '/', label: 'Vendas', icon: ReceiptText, end: true },
    { to: '/nova-venda', label: 'Nova venda', icon: PlusCircle },
    ...(isAdmin ? [{ to: '/produtos', label: 'Lentes e preços', icon: Glasses }] : []),
  ]
  const linkCls = ({ isActive }) =>
    cx(
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-line/40 hover:text-ink'
    )

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col justify-between border-r border-line bg-surface p-4 md:flex">
        <div className="flex flex-col gap-8">
          <Marca />
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                <l.icon className="h-4 w-4" aria-hidden /> {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="text-sm">
            <p className="font-semibold">{perfil.nome}</p>
            <p className="text-muted">{isAdmin ? 'Administrador' : perfil.loja?.nome}</p>
          </div>
          <button onClick={sair} className="flex items-center gap-2 text-sm text-muted hover:text-danger">
            <LogOut className="h-4 w-4" aria-hidden /> Sair
          </button>
        </div>
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <Marca />
        <button onClick={sair} aria-label="Sair" className="rounded-md p-2 text-muted hover:text-danger">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="min-w-0 px-4 pb-24 pt-6 sm:px-8 md:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium', isActive ? 'text-brand' : 'text-muted')}
          >
            <l.icon className="h-5 w-5" aria-hidden /> {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
