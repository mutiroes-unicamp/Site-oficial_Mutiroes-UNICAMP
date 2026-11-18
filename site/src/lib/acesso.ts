/** RA só com dígitos ("123.456" -> "123456"). */
export const limparRa = (ra: string) => ra.replace(/\D/g, '')

export const raValido = (ra: string) => /^\d{5,6}$/.test(limparRa(ra))

/**
 * A organização entra com RA + senha. Por baixo, o Supabase Auth exige um e-mail:
 * usamos um endereço técnico no domínio reservado .invalid (nunca recebe e-mail).
 * O banco só aceita criar essas contas se houver convite (tabela convites_admin).
 */
export const emailAdmin = (ra: string) => `admin.${limparRa(ra)}@mutiroes.invalid`

// RA consultado fica salvo só nesta aba do navegador, por conveniência.
const CHAVE_RA = 'mutiroes.ra'
export function raSalvo(): string {
  try {
    return sessionStorage.getItem(CHAVE_RA) ?? ''
  } catch {
    return ''
  }
}
export function salvarRa(ra: string | null) {
  try {
    if (ra) sessionStorage.setItem(CHAVE_RA, limparRa(ra))
    else sessionStorage.removeItem(CHAVE_RA)
  } catch {
    /* navegação privada etc.: segue sem lembrar */
  }
}

/** Cargos da equipe. Só os que validam horas têm efeito no banco (privado.cargo_valida). */
export const CARGOS = ['Capitã', 'Capitão', 'Vice-capitã', 'Vice-capitão'] as const

/** Mesmo critério do banco: capitã(o) ou vice-capitã(o), com ou sem acento. */
export function cargoValida(cargo: string | null | undefined): boolean {
  const c = (cargo ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ['capita', 'capitao', 'vice-capita', 'vice-capitao'].includes(c)
}
