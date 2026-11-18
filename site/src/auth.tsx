import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Organizador } from './lib/tipos'

/** Sessão só existe para a organização (RA + senha). Alunos não fazem login. */
interface Estado {
  carregando: boolean
  sessao: Session | null
  organizador: Organizador | null
  sair: () => Promise<void>
}

const Ctx = createContext<Estado | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [sessaoPronta, setSessaoPronta] = useState(false)
  const [organizador, setOrganizador] = useState<Organizador | null>(null)
  const [perfilPronto, setPerfilPronto] = useState(false)

  // Não chamar o Supabase dentro do callback de onAuthStateChange (pode travar);
  // só guardamos a sessão e o efeito abaixo carrega o papel.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setSessaoPronta(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      setSessaoPronta(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = sessao?.user.id ?? null

  useEffect(() => {
    let vivo = true
    setPerfilPronto(false)
    ;(async () => {
      if (!uid) {
        setOrganizador(null)
      } else {
        const { data, error } = await supabase.from('organizadores').select('*').eq('user_id', uid).maybeSingle()
        if (error) console.error('Falha ao carregar papel', error)
        if (vivo) setOrganizador((data as Organizador | null) ?? null)
      }
      if (vivo) setPerfilPronto(true)
    })()
    return () => {
      vivo = false
    }
  }, [uid])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <Ctx.Provider value={{ carregando: !sessaoPronta || !perfilPronto, sessao, organizador, sair }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
