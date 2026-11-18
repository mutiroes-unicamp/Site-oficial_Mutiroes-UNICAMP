import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth'
import { msgErro, supabase } from '../lib/supabase'
import { Aviso, Botao, Campo, Cartao, Carregando, Entrada } from '../ui'

export default function Entrar() {
  const { carregando, sessao, participante, papel } = useAuth()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (carregando) return <Carregando />
  if (sessao) return <Navigate to={participante ? '/' : papel ? '/admin' : '/cadastro'} replace />

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL, shouldCreateUser: true },
    })
    setOcupado(false)
    if (error) setErro(error.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' : msgErro(error))
    else setEnviado(true)
  }

  async function verificar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: codigo.trim(), type: 'email' })
    setOcupado(false)
    if (error) setErro('Código inválido ou expirado.')
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Mutirões UNICAMP</h1>
      <p className="mb-6 text-sm text-stone-600">
        Inscreva-se nos eventos, acompanhe suas presenças e solicite a validação das suas horas de extensão.
      </p>
      <Cartao>
        {!enviado ? (
          <form onSubmit={enviar} className="space-y-4">
            <Campo rotulo="E-mail" dica="Use o mesmo e-mail que você usava nos formulários do Mutirões para recuperar seu histórico.">
              <Entrada type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Campo>
            <Aviso>{erro}</Aviso>
            <Botao type="submit" carregando={ocupado} className="w-full">Receber link de acesso</Botao>
            <p className="text-xs text-stone-500">Sem senha: enviamos um link de acesso para o seu e-mail.</p>
          </form>
        ) : (
          <div className="space-y-4">
            <Aviso tom="verde">
              Enviamos um link para <strong>{email}</strong>. Abra o e-mail e clique no link para entrar. Confira também a caixa de spam.
            </Aviso>
            <form onSubmit={verificar} className="space-y-3">
              <Campo rotulo="Recebeu um código numérico?" dica="Se o e-mail trouxer um código, digite-o aqui.">
                <Entrada inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              </Campo>
              <Aviso>{erro}</Aviso>
              <div className="flex gap-2">
                <Botao type="submit" carregando={ocupado} disabled={codigo.trim().length < 6}>Entrar com código</Botao>
                <Botao type="button" variante="fantasma" onClick={() => { setEnviado(false); setCodigo('') }}>Trocar e-mail</Botao>
              </div>
            </form>
          </div>
        )}
      </Cartao>
    </div>
  )
}
