import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from './auth'

const BASE = import.meta.env.BASE_URL

function ItemMenu({ para, children, fim, onClick }: { para: string; children: string; fim?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={para}
      end={fim}
      onClick={onClick}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-marca-50 text-marca-700' : 'text-stone-600 hover:bg-stone-100'}`
      }
    >
      {children}
    </NavLink>
  )
}

export default function Layout() {
  const { sessao, participante, papel, sair } = useAuth()
  const [aberto, setAberto] = useState(false)
  const fechar = () => setAberto(false)

  const itens = (
    <>
      {participante && (
        <>
          <ItemMenu para="/" fim onClick={fechar}>Minhas horas</ItemMenu>
          <ItemMenu para="/eventos" onClick={fechar}>Eventos</ItemMenu>
          <ItemMenu para="/perfil" onClick={fechar}>Meu cadastro</ItemMenu>
        </>
      )}
      {papel && (
        <>
          <div className="mt-3 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-stone-400 md:hidden">Organização</div>
          <ItemMenu para="/admin" fim onClick={fechar}>Painel</ItemMenu>
          <ItemMenu para="/admin/eventos" onClick={fechar}>Eventos</ItemMenu>
          <ItemMenu para="/admin/participantes" onClick={fechar}>Participantes</ItemMenu>
          <ItemMenu para="/admin/solicitacoes" onClick={fechar}>Validações</ItemMenu>
          <ItemMenu para="/admin/planilha" onClick={fechar}>Planilha</ItemMenu>
          {papel === 'admin' && <ItemMenu para="/admin/organizadores" onClick={fechar}>Equipe</ItemMenu>}
        </>
      )}
    </>
  )

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to={participante ? '/' : papel ? '/admin' : '/entrar'} className="flex items-center gap-2">
            <img src={`${BASE}logo.png`} alt="Mutirões UNICAMP" className="h-8 w-auto" />
          </Link>
          {sessao && (
            <>
              <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
                {itens}
              </nav>
              <div className="flex items-center gap-2">
                <button
                  onClick={sair}
                  className="hidden rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 md:block"
                >
                  Sair
                </button>
                <button
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm md:hidden"
                  aria-expanded={aberto}
                  aria-controls="menu-movel"
                  onClick={() => setAberto((a) => !a)}
                >
                  Menu
                </button>
              </div>
            </>
          )}
        </div>
        {sessao && aberto && (
          <nav id="menu-movel" className="border-t border-stone-100 px-4 py-2 md:hidden" aria-label="Principal (celular)">
            {itens}
            <button onClick={sair} className="mt-2 block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-100">
              Sair
            </button>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
