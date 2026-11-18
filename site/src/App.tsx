import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth'
import { cargoValida } from './lib/acesso'
import { configurado } from './lib/supabase'
import Layout from './Layout'
import { Aviso, Carregando } from './ui'
import Inicio from './pages/publico/Inicio'
import Consulta from './pages/publico/Consulta'
import Inscricao from './pages/publico/Inscricao'
import EntrarAdmin from './pages/admin/Entrar'

// Telas da organização: carregadas só quando acessadas (o público não baixa esse código)
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
const MinhaSenha = lazy(() => import('./pages/admin/MinhaSenha'))

/** Exige login de organização (RA + senha). */
function Org({ children, soAdmin, soValidacao }: { children: ReactNode; soAdmin?: boolean; soValidacao?: boolean }) {
  const { carregando, sessao, organizador } = useAuth()
  if (carregando) return <Carregando />
  if (!sessao || !organizador) return <Navigate to="/admin/entrar" replace />
  if (soAdmin && organizador.papel !== 'admin') return <Aviso>Esta área é restrita a administradores.</Aviso>
  if (soValidacao && !cargoValida(organizador.cargo)) return <Aviso>A validação de horas é restrita à Capitã(o) e à Vice-capitã(o).</Aviso>
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
        <Route path="/" element={<Inicio />} />
        <Route path="/consulta" element={<Consulta />} />
        <Route path="/eventos/:id" element={<Inscricao />} />

        <Route path="/admin/entrar" element={<EntrarAdmin />} />
        <Route path="/admin" element={<Org><Painel /></Org>} />
        <Route path="/admin/eventos" element={<Org><EventosAdmin /></Org>} />
        <Route path="/admin/eventos/novo" element={<Org><EventoForm /></Org>} />
        <Route path="/admin/eventos/:id" element={<Org><EventoDetalhe /></Org>} />
        <Route path="/admin/eventos/:id/editar" element={<Org><EventoForm /></Org>} />
        <Route path="/admin/eventos/:id/presenca" element={<Org><Presenca /></Org>} />
        <Route path="/admin/participantes" element={<Org><Participantes /></Org>} />
        <Route path="/admin/participantes/:id" element={<Org><ParticipanteDetalhe /></Org>} />
        <Route path="/admin/solicitacoes" element={<Org soValidacao><Solicitacoes /></Org>} />
        <Route path="/admin/planilha" element={<Org><Planilha /></Org>} />
        <Route path="/admin/equipe" element={<Org soAdmin><Organizadores /></Org>} />
        <Route path="/admin/senha" element={<Org><MinhaSenha /></Org>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
