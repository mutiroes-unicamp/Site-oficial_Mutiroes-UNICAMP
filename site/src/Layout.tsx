import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from './auth'
import { cargoValida } from './lib/acesso'

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
  const { organizador, sair } = useAuth()
  const [aberto, setAberto] = useState(false)
  const fechar = () => setAberto(false)

  const itens = organizador ? (
    <>
      <ItemMenu para="/admin" fim onClick={fechar}>Painel</ItemMenu>
      <ItemMenu para="/admin/eventos" onClick={fechar}>Eventos</ItemMenu>
      <ItemMenu para="/admin/participantes" onClick={fechar}>Participantes</ItemMenu>
      {cargoValida(organizador.cargo) && <ItemMenu para="/admin/solicitacoes" onClick={fechar}>Validações</ItemMenu>}
      <ItemMenu para="/admin/planilha" onClick={fechar}>Planilha</ItemMenu>
      {organizador.papel === 'admin' && <ItemMenu para="/admin/equipe" onClick={fechar}>Equipe</ItemMenu>}
      <ItemMenu para="/" fim onClick={fechar}>Site público</ItemMenu>
    </>
  ) : (
    <>
      <ItemMenu para="/" fim onClick={fechar}>Eventos</ItemMenu>
      <ItemMenu para="/consulta" onClick={fechar}>Minhas horas</ItemMenu>
    </>
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to={organizador ? '/admin' : '/'} className="flex items-center gap-2">
            <img src={`${BASE}logo.png`} alt="Mutirões UNICAMP" className="h-8 w-auto" />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">{itens}</nav>
          <div className="flex items-center gap-2">
            {organizador ? (
              <div className="hidden items-center gap-1 md:flex">
                <Link to="/admin/senha" className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100" title="Trocar senha">
                  {organizador.nome.split(' ')[0]}
                </Link>
                <button onClick={sair} className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">Sair</button>
              </div>
            ) : (
              <Link to="/admin/entrar" className="hidden rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 md:block">
                Acessar como administrador
              </Link>
            )}
            <button
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm md:hidden"
              aria-expanded={aberto}
              aria-controls="menu-movel"
              onClick={() => setAberto((a) => !a)}
            >
              Menu
            </button>
          </div>
        </div>
        {aberto && (
          <nav id="menu-movel" className="border-t border-stone-100 px-4 py-2 md:hidden" aria-label="Principal (celular)">
            {itens}
            {organizador ? (
              <>
                <ItemMenu para="/admin/senha" onClick={fechar}>Trocar senha</ItemMenu>
                <button onClick={() => { fechar(); void sair() }} className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-100">
                  Sair
                </button>
              </>
            ) : (
              <ItemMenu para="/admin/entrar" onClick={fechar}>Acessar como administrador</ItemMenu>
            )}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 text-xs text-stone-500">
        Mutirões UNICAMP · Desenvolvido por{' '}
        <a href="https://www.linkedin.com/in/brunna-santella/" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-marca-700">
          Brunna Santella Souza
        </a>
      </footer>
    </div>
  )
}
