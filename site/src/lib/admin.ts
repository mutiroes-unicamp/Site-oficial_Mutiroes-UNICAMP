// Consultas usadas por várias telas da organização.
import { ok, supabase, todos } from './supabase'
import type { Categoria, Curso, Evento, Inscricao, Participante, ResumoEvento, Saldo } from './tipos'

export async function carregarCursos() {
  return ok(await supabase.from('cursos').select('id, nome').order('nome')) as Curso[]
}

export async function carregarCategorias() {
  return ok(await supabase.from('categorias_evento').select('id, nome').order('nome')) as Categoria[]
}

export type EventoComResumo = Evento & { resumo: ResumoEvento | null; categoria: string | null }

export async function carregarEventos(): Promise<EventoComResumo[]> {
  const [evs, res, cats] = await Promise.all([
    todos<Evento>((de, ate) => supabase.from('eventos').select('*').order('inicio', { ascending: false }).range(de, ate)),
    todos<ResumoEvento>((de, ate) => supabase.from('resumo_eventos').select('*').range(de, ate)),
    carregarCategorias(),
  ])
  const porId = new Map(res.map((r) => [r.evento_id, r]))
  const cat = new Map(cats.map((c) => [c.id, c.nome]))
  return evs.map((e) => ({ ...e, resumo: porId.get(e.id) ?? null, categoria: e.categoria_id ? cat.get(e.categoria_id) ?? null : null }))
}

export type ParticipanteCompleto = Participante & { saldo: Saldo | null; curso: string | null }

export async function carregarParticipantes(): Promise<ParticipanteCompleto[]> {
  const [ps, saldos, cursos] = await Promise.all([
    todos<Participante>((de, ate) => supabase.from('participantes').select('*').order('nome').range(de, ate)),
    todos<Saldo>((de, ate) => supabase.from('saldo_horas').select('*').range(de, ate)),
    carregarCursos(),
  ])
  const s = new Map(saldos.map((x) => [x.participante_id, x]))
  const c = new Map(cursos.map((x) => [x.id, x.nome]))
  return ps.map((p) => ({ ...p, saldo: s.get(p.id) ?? null, curso: p.curso_id ? c.get(p.curso_id) ?? null : null }))
}

export async function carregarTodasInscricoes() {
  return todos<Inscricao>((de, ate) =>
    supabase.from('inscricoes').select('id, participante_id, evento_id, status, origem, respostas, presenca_registrada_em, criado_em')
      .order('id').range(de, ate),
  )
}
