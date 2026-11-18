// Espelha supabase/migrations/*.sql. Atualize junto com o esquema.

export type TipoParticipante = 'aluno_unicamp' | 'externo'
export type StatusEvento = 'planejado' | 'inscricoes_abertas' | 'inscricoes_encerradas' | 'realizado' | 'cancelado'
export type StatusInscricao = 'inscrito' | 'lista_espera' | 'sem_vaga' | 'presente' | 'ausente' | 'cancelada'
export type StatusSolicitacao = 'pendente' | 'aprovada' | 'recusada'
export type Papel = 'organizador' | 'admin'

export interface Curso { id: number; nome: string }
export interface Categoria { id: number; nome: string }

export interface Participante {
  id: string
  user_id: string | null
  nome: string
  email: string
  ra: string | null
  tipo: TipoParticipante
  curso_id: number | null
  ano_ingresso: number | null
  celular: string | null
  idade: number | null
  genero: string | null
  na_comunidade: boolean | null
  observacoes: string | null
  criado_em: string
}

export type TipoPergunta = 'texto' | 'sim_nao' | 'numero' | 'opcao'
export interface Pergunta {
  id: string
  rotulo: string
  tipo: TipoPergunta
  obrigatoria?: boolean
  opcoes?: string[]
}

export interface Evento {
  id: number
  codigo_legado: string | null
  edicao: string | null
  titulo: string
  descricao: string | null
  categoria_id: number | null
  local: string | null
  inicio: string
  horas: number
  vagas: number | null
  inscricoes_ate: string | null
  status: StatusEvento
  perguntas: Pergunta[]
  observacoes: string | null
}

/** Retorno de listar_eventos_aluno() */
export interface EventoAluno {
  id: number
  titulo: string
  descricao: string | null
  categoria: string | null
  local: string | null
  inicio: string
  horas: number
  vagas: number | null
  vagas_restantes: number | null
  inscricoes_ate: string | null
  status: StatusEvento
  perguntas: Pergunta[]
  minha_inscricao: StatusInscricao | null
}

export interface Inscricao {
  id: number
  participante_id: string
  evento_id: number
  status: StatusInscricao
  origem: 'plataforma' | 'forms_legado' | 'planilha_legado' | 'manual'
  respostas: Record<string, string>
  presenca_registrada_em: string | null
  criado_em: string
}

export interface Saldo {
  participante_id: string
  horas_acumuladas: number
  horas_validadas: number
  horas_pendentes: number
  horas_disponiveis: number
}

export interface ResumoEvento {
  evento_id: number
  inscritos: number
  lista_espera: number
  sem_vaga: number
  presentes: number
  ausentes: number
  canceladas: number
}

export interface Solicitacao {
  id: number
  participante_id: string
  horas: number
  status: StatusSolicitacao
  solicitado_em: string
  decidido_em: string | null
  observacao: string | null
}

export interface Ajuste {
  id: number
  participante_id: string
  horas: number
  motivo: string
  criado_em: string
}
