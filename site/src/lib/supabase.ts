import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const configurado = Boolean(url && chave)

export const supabase = createClient(url ?? 'http://nao-configurado.invalid', chave ?? 'nao-configurado', {
  auth: {
    // 'implicit': o link mágico funciona mesmo aberto em outro aparelho
    flowType: 'implicit',
    detectSessionInUrl: true,
    persistSession: true,
  },
})

/** Mensagem legível de erros do Supabase/Postgres (as RPCs já mandam texto em português). */
export function msgErro(e: unknown): string {
  if (!e) return 'Erro desconhecido'
  if (typeof e === 'string') return e
  const err = e as { message?: string; code?: string; details?: string }
  if (err.code === '23505') return 'Registro duplicado: já existe um cadastro com esse valor.'
  if (err.code === '42501') return 'Você não tem permissão para esta ação.'
  return err.message ?? String(e)
}

/** Lança se houver erro; devolve os dados. */
export function ok<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}

/**
 * A API devolve no máximo 1000 linhas por requisição; isto busca todas as páginas.
 * `montar(de, ate)` deve devolver a query com `.range(de, ate)` aplicado.
 */
export async function todos<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const TAM = 1000
  const saida: T[] = []
  for (let de = 0; ; de += TAM) {
    const pagina = ok(await montar(de, de + TAM - 1))
    saida.push(...pagina)
    if (pagina.length < TAM) return saida
  }
}
