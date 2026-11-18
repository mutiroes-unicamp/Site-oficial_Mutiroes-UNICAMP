import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, ok } from './lib/supabase'
import type { Papel, Participante } from './lib/tipos'

interface Estado {
  carregando: boolean
  sessao: Session | null
  participante: Participante | null
  papel: Papel | null
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const Ctx = createContext<Estado | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [sessaoPronta, setSessaoPronta] = useState(false)
  const [participante, setParticipante] = useState<Participante | null>(null)
  const [papel, setPapel] = useState<Papel | null>(null)
  const [perfilPronto, setPerfilPronto] = useState(false)

  // Não chamar o Supabase dentro do callback de onAuthStateChange (pode travar);
  // só guardamos a sessão e o efeito abaixo carrega o perfil.
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

  const carregarPerfil = useCallback(async () => {
    if (!uid) {
      setParticipante(null)
      setPapel(null)
      setPerfilPronto(true)
      return
    }
    try {
      // vincula a conta a um cadastro importado com o mesmo e-mail (se houver)
      const linhas = ok(await supabase.rpc('vincular_minha_conta')) as Participante[]
      setParticipante(linhas[0] ?? null)
      const org = ok(await supabase.from('organizadores').select('papel').eq('user_id', uid).maybeSingle()) as
        | { papel: Papel }
        | null
      setPapel(org?.papel ?? null)
    } catch (e) {
      console.error('Falha ao carregar perfil', e)
      setParticipante(null)
      setPapel(null)
    } finally {
      setPerfilPronto(true)
    }
  }, [uid])

  useEffect(() => {
    setPerfilPronto(false)
    void carregarPerfil()
  }, [carregarPerfil])

  // Limpa o #access_token=... da barra de endereço depois do login por link
  useEffect(() => {
    if (sessao && window.location.hash.includes('access_token')) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [sessao])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <Ctx.Provider
      value={{
        carregando: !sessaoPronta || !perfilPronto,
        sessao,
        participante,
        papel,
        recarregar: carregarPerfil,
        sair,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
