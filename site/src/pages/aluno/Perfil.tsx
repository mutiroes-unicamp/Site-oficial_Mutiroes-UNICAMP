import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth'
import { msgErro, ok, supabase } from '../../lib/supabase'
import type { Curso } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Cartao, Carregando, Titulo } from '../../ui'
import { CamposCadastro, deParticipante, paraLinha, type DadosCadastro } from '../CamposCadastro'

export default function Perfil() {
  const { participante, recarregar } = useAuth()
  const cursos = useDados(async () => ok(await supabase.from('cursos').select('id, nome').order('nome')) as Curso[], [])
  const [d, setD] = useState<DadosCadastro>(() => deParticipante(participante!))
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'verde' | 'vermelho'; texto: string } | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setOcupado(true)
    // RA, e-mail e vínculo só a organização altera (o banco recusa)
    const { error } = await supabase.from('participantes').update(paraLinha(d)).eq('id', participante!.id)
    setOcupado(false)
    if (error) return setMsg({ tom: 'vermelho', texto: msgErro(error) })
    setMsg({ tom: 'verde', texto: 'Cadastro atualizado.' })
    await recarregar()
  }

  if (cursos.carregando) return <Carregando />
  return (
    <div className="mx-auto max-w-2xl">
      <Titulo sub={<>E-mail de acesso: <strong>{participante!.email}</strong></>}>Meu cadastro</Titulo>
      <Cartao>
        <form onSubmit={salvar} className="space-y-5">
          <CamposCadastro d={d} set={setD} cursos={cursos.dados ?? []} podeEditarIdentidade={false} />
          {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
          <Botao type="submit" carregando={ocupado}>Salvar</Botao>
        </form>
      </Cartao>
    </div>
  )
}
