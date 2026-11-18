import type { StatusEvento, StatusInscricao, StatusSolicitacao } from './tipos'

const TZ = 'America/Sao_Paulo'

export const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export const fmtDataHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—'

export const fmtHoras = (h: number | string | null | undefined) => {
  const n = Number(h ?? 0)
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
}

/** ISO -> valor de <input type="datetime-local"> no horário de Brasília */
export function paraInputLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d)
  return p.replace(' ', 'T')
}

/** valor de <input type="datetime-local"> (Brasília) -> ISO */
export function deInputLocal(v: string): string | null {
  return v ? new Date(`${v}:00-03:00`).toISOString() : null
}

export const ROTULO_EVENTO: Record<StatusEvento, string> = {
  planejado: 'Rascunho',
  inscricoes_abertas: 'Inscrições abertas',
  inscricoes_encerradas: 'Inscrições encerradas',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
}

export const ROTULO_INSCRICAO: Record<StatusInscricao, string> = {
  inscrito: 'Inscrito',
  lista_espera: 'Lista de espera',
  sem_vaga: 'Sem vaga',
  presente: 'Presente',
  ausente: 'Ausente',
  cancelada: 'Cancelada',
}

export const ROTULO_SOLICITACAO: Record<StatusSolicitacao, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
}

export type Tom = 'verde' | 'amarelo' | 'vermelho' | 'azul' | 'cinza'

export const TOM_INSCRICAO: Record<StatusInscricao, Tom> = {
  inscrito: 'azul', lista_espera: 'amarelo', sem_vaga: 'cinza', presente: 'verde', ausente: 'vermelho', cancelada: 'cinza',
}
export const TOM_EVENTO: Record<StatusEvento, Tom> = {
  planejado: 'cinza', inscricoes_abertas: 'verde', inscricoes_encerradas: 'amarelo', realizado: 'azul', cancelado: 'vermelho',
}
export const TOM_SOLICITACAO: Record<StatusSolicitacao, Tom> = { pendente: 'amarelo', aprovada: 'verde', recusada: 'vermelho' }

/** comparação de texto sem acento e sem maiúsculas, para buscas */
export const normalizar = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
