import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth'
import { configurado } from './lib/supabase'
import Layout from './Layout'
import { Aviso, Carregando } from './ui'
import Entrar from './pages/Entrar'
import Cadastro from './pages/Cadastro'
import MinhasHoras from './pages/aluno/MinhasHoras'
import EventosAluno from './pages/aluno/Eventos'
import Perfil from './pages/aluno/Perfil'

// Telas da organização: carregadas só quando acessadas (alunos não baixam esse código)
const Painel = lazy(() => import('./pages/admin/Painel'))
const EventosAdmin = lazy(() => import('./pages/admin/Eventos'))
const EventoForm = lazy(() => import('./pages/admin/EventoForm'))
const EventoDetalhe = lazy(() => import('./pages/admin/EventoDetalhe'))
const Presenca = lazy(() => import('./pages/admin/Presenca'))
const Participantes = lazy(() => import('./pages/admin/Participantes'))
const ParticipanteDetalhe = lazy(() => import('./pages/admin/ParticipanteDetalhe'))
const Solicitacoes = lazy(() => import('./pages/admin/Solicitacoes'))
const Planilha = lazy(() => import('./pages/admin/Planilha'))
const Organizadores = lazy(() => import('./pages/admin/Organizadores'))

/** Exige login; quem ainda não tem cadastro vai para /cadastro (exceto organização). */
function Aluno({ children }: { children: ReactNode }) {
  const { carregando, sessao, participante, papel } = useAuth()
  const loc = useLocation()
  if (carregando) return <Carregando />
  if (!sessao) return <Navigate to="/entrar" replace state={{ de: loc.pathname }} />
  if (!participante) return <Navigate to={papel ? '/admin' : '/cadastro'} replace />
  return children
}

function Org({ children, soAdmin }: { children: ReactNode; soAdmin?: boolean }) {
  const { carregando, sessao, papel } = useAuth()
  if (carregando) return <Carregando />
  if (!sessao) return <Navigate to="/entrar" replace />
  if (!papel || (soAdmin && papel !== 'admin')) return <Aviso>Esta área é restrita à organização do Mutirões.</Aviso>
  return <Suspense fallback={<Carregando />}>{children}</Suspense>
}

export default function App() {
  if (!configurado) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Aviso>
          Site não configurado: defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (veja{' '}
          <code>site/.env.example</code>).
        </Aviso>
      </div>
    )
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/cadastro" element={<Cadastro />} />

        <Route path="/" element={<Aluno><MinhasHoras /></Aluno>} />
        <Route path="/eventos" element={<Aluno><EventosAluno /></Aluno>} />
        <Route path="/perfil" element={<Aluno><Perfil /></Aluno>} />

        <Route path="/admin" element={<Org><Painel /></Org>} />
        <Route path="/admin/eventos" element={<Org><EventosAdmin /></Org>} />
        <Route path="/admin/eventos/novo" element={<Org><EventoForm /></Org>} />
        <Route path="/admin/eventos/:id" element={<Org><EventoDetalhe /></Org>} />
        <Route path="/admin/eventos/:id/editar" element={<Org><EventoForm /></Org>} />
        <Route path="/admin/eventos/:id/presenca" element={<Org><Presenca /></Org>} />
        <Route path="/admin/participantes" element={<Org><Participantes /></Org>} />
        <Route path="/admin/participantes/:id" element={<Org><ParticipanteDetalhe /></Org>} />
        <Route path="/admin/solicitacoes" element={<Org><Solicitacoes /></Org>} />
        <Route path="/admin/planilha" element={<Org><Planilha /></Org>} />
        <Route path="/admin/organizadores" element={<Org soAdmin><Organizadores /></Org>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
