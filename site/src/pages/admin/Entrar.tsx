import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../../auth'
import { emailAdmin, limparRa, raValido } from '../../lib/acesso'
import { msgErro, supabase } from '../../lib/supabase'
import { Aviso, Botao, Campo, Cartao, Carregando, Entrada } from '../../ui'

const MIN_SENHA = 8

/** "Acessar como administrador": RA + senha. Primeiro acesso exige convite de um admin. */
export default function EntrarAdmin() {
  const { carregando, sessao, organizador, sair } = useAuth()
  const [aba, setAba] = useState<'entrar' | 'primeiro'>('entrar')
  const [ra, setRa] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (carregando) return <Carregando />
  if (sessao && organizador) return <Navigate to="/admin" replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!raValido(ra)) return setErro('Digite um RA com 5 ou 6 dígitos.')
    setOcupado(true)
    const { error } = await supabase.auth.signInWithPassword({ email: emailAdmin(ra), password: senha })
    setOcupado(false)
    if (error) {
      setErro(error.status === 400 ? 'RA ou senha incorretos.' : error.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos.' : msgErro(error))
    }
  }

  async function primeiroAcesso(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!raValido(ra)) return setErro('Digite um RA com 5 ou 6 dígitos.')
    if (senha.length < MIN_SENHA) return setErro(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`)
    if (senha !== senha2) return setErro('As senhas não conferem.')
    setOcupado(true)
    const { data, error } = await supabase.auth.signUp({ email: emailAdmin(ra), password: senha })
    setOcupado(false)
    if (error) {
      const m = msgErro(error)
      return setErro(
        /convite/i.test(m) || /database error/i.test(m)
          ? 'Não há convite em aberto para este RA (ou ele já foi usado). Peça a um administrador para convidar você em “Equipe”.'
          : /already|registered/i.test(m)
            ? 'Este RA já tem acesso. Use a aba “Entrar”. Esqueceu a senha? Peça a um administrador para redefinir seu acesso.'
            : m,
      )
    }
    // Supabase não informa erro para conta já existente; sem sessão = já havia conta
    if (!data.session) setErro('Este RA já tem acesso. Use a aba “Entrar”. Esqueceu a senha? Peça a um administrador para redefinir seu acesso.')
  }

  return (
    <div className="mx-auto max-w-md pt-4">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Acesso da organização</h1>
      <p className="mb-6 text-sm text-stone-600">Área para a equipe do Mutirões criar eventos, registrar presenças e validar horas.</p>

      {sessao && !organizador && (
        <div className="mb-4">
          <Aviso tom="amarelo">
            Esta conta não tem acesso à organização. <button className="underline" onClick={sair}>Sair</button>
          </Aviso>
        </div>
      )}

      <div className="mb-3 flex gap-1 rounded-lg bg-stone-200/60 p-1 text-sm" role="tablist">
        {(['entrar', 'primeiro'] as const).map((a) => (
          <button
            key={a} role="tab" aria-selected={aba === a}
            onClick={() => { setAba(a); setErro(null) }}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium ${aba === a ? 'bg-white shadow-xs' : 'text-stone-600'}`}
          >
            {a === 'entrar' ? 'Entrar' : 'Primeiro acesso'}
          </button>
        ))}
      </div>

      <Cartao>
        <form onSubmit={aba === 'entrar' ? entrar : primeiroAcesso} className="space-y-4">
          {aba === 'primeiro' && (
            <p className="text-sm text-stone-600">
              Recebeu um convite de um administrador? Defina aqui a sua senha. O convite vale por 7 dias.
            </p>
          )}
          <Campo rotulo="RA">
            <Entrada inputMode="numeric" autoComplete="username" required value={ra} onChange={(e) => setRa(limparRa(e.target.value))} />
          </Campo>
          <Campo rotulo={aba === 'entrar' ? 'Senha' : 'Nova senha'} dica={aba === 'primeiro' ? `Mínimo de ${MIN_SENHA} caracteres.` : undefined}>
            <Entrada type="password" required autoComplete={aba === 'entrar' ? 'current-password' : 'new-password'} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          {aba === 'primeiro' && (
            <Campo rotulo="Repita a senha">
              <Entrada type="password" required autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} />
            </Campo>
          )}
          <Aviso>{erro}</Aviso>
          <Botao type="submit" carregando={ocupado} className="w-full">{aba === 'entrar' ? 'Entrar' : 'Criar minha senha'}</Botao>
        </form>
      </Cartao>
    </div>
  )
}
