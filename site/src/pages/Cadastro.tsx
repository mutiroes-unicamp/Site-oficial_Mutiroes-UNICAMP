import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth'
import { msgErro, ok, supabase } from '../lib/supabase'
import type { Curso } from '../lib/tipos'
import { useDados } from '../lib/useDados'
import { Aviso, Botao, Cartao, Carregando, Titulo } from '../ui'
import { CamposCadastro, paraLinha, type DadosCadastro } from './CamposCadastro'

export default function Cadastro() {
  const { carregando, sessao, participante, recarregar } = useAuth()
  const cursos = useDados(async () => ok(await supabase.from('cursos').select('id, nome').order('nome')) as Curso[], [])
  const [d, setD] = useState<DadosCadastro>({
    nome: '', tipo: 'aluno_unicamp', ra: '', curso_id: '', ano_ingresso: '', celular: '', idade: '', genero: '', na_comunidade: '',
  })
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (carregando) return <Carregando />
  if (!sessao) return <Navigate to="/entrar" replace />
  if (participante) return <Navigate to="/" replace />

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    const { error } = await supabase.from('participantes').insert({
      ...paraLinha(d),
      user_id: sessao!.user.id,
      email: (sessao!.user.email ?? '').toLowerCase(),
      tipo: d.tipo,
      ra: d.tipo === 'aluno_unicamp' ? d.ra.trim() : null,
    })
    setOcupado(false)
    if (error) {
      setErro(
        error.code === '23505'
          ? 'Já existe um cadastro com esse RA. Se for você, entre com o e-mail usado antes ou fale com a organização.'
          : msgErro(error),
      )
      return
    }
    await recarregar()
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Titulo sub={<>Primeiro acesso com <strong>{sessao.user.email}</strong>. Não encontramos um cadastro anterior com este e-mail.</>}>
        Complete seu cadastro
      </Titulo>
      <Cartao>
        {cursos.carregando ? (
          <Carregando />
        ) : (
          <form onSubmit={salvar} className="space-y-5">
            <CamposCadastro d={d} set={setD} cursos={cursos.dados ?? []} podeEditarIdentidade />
            <Aviso tom="amarelo">
              Já participou de eventos com <em>outro</em> e-mail? Saia e entre com aquele e-mail para recuperar seu histórico de horas.
            </Aviso>
            <Aviso>{erro}</Aviso>
            <Botao type="submit" carregando={ocupado}>Salvar cadastro</Botao>
          </form>
        )}
      </Cartao>
    </div>
  )
}
