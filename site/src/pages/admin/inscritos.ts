import { ok, supabase, todos } from '../../lib/supabase'
import type { Evento, Inscricao, Participante } from '../../lib/tipos'

export type InscritoCompleto = Inscricao & { participantes: Participante & { cursos: { nome: string } | null } }

export async function carregarEventoComInscritos(id: string) {
  const [ev, insc] = await Promise.all([
    supabase.from('eventos').select('*, categorias_evento(nome)').eq('id', id).single(),
    todos<InscritoCompleto>((de, ate) =>
      supabase.from('inscricoes').select('*, participantes(*, cursos(nome))').eq('evento_id', id).order('criado_em').range(de, ate),
    ),
  ])
  const evento = ok(ev) as Evento & { categorias_evento: { nome: string } | null }
  insc.sort((a, b) => a.participantes.nome.localeCompare(b.participantes.nome, 'pt-BR'))
  return { evento, inscritos: insc }
}
