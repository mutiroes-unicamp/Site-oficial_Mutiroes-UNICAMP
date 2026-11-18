import { useState, type FormEvent } from 'react'
import { msgErro, supabase } from '../../lib/supabase'
import { Aviso, Botao, Campo, Cartao, Entrada, Titulo } from '../../ui'

export default function MinhaSenha() {
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'verde' | 'vermelho'; texto: string } | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (senha.length < 8) return setMsg({ tom: 'vermelho', texto: 'A senha precisa ter pelo menos 8 caracteres.' })
    if (senha !== senha2) return setMsg({ tom: 'vermelho', texto: 'As senhas não conferem.' })
    setOcupado(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setOcupado(false)
    if (error) return setMsg({ tom: 'vermelho', texto: msgErro(error) })
    setSenha('')
    setSenha2('')
    setMsg({ tom: 'verde', texto: 'Senha alterada.' })
  }

  return (
    <div className="mx-auto max-w-md">
      <Titulo>Trocar minha senha</Titulo>
      <Cartao>
        <form onSubmit={salvar} className="space-y-4">
          <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres.">
            <Entrada type="password" required autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          <Campo rotulo="Repita a nova senha">
            <Entrada type="password" required autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} />
          </Campo>
          {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
          <Botao type="submit" carregando={ocupado}>Salvar nova senha</Botao>
        </form>
      </Cartao>
    </div>
  )
}
