import { useCallback, useEffect, useRef, useState } from 'react'
import { msgErro } from './supabase'

/** Carrega dados assíncronos com estado de carregamento/erro e função de recarga. */
export function useDados<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const vez = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fn = useCallback(carregar, deps)

  const recarregar = useCallback(async () => {
    const minha = ++vez.current
    setCarregando(true)
    setErro(null)
    try {
      const d = await fn()
      if (minha === vez.current) setDados(d)
    } catch (e) {
      if (minha === vez.current) setErro(msgErro(e))
    } finally {
      if (minha === vez.current) setCarregando(false)
    }
  }, [fn])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  return { dados, erro, carregando, recarregar, setDados }
}
