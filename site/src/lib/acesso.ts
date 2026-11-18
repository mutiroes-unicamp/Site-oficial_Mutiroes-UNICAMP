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
