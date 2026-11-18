import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { limparRa, raSalvo, raValido, salvarRa } from '../../lib/acesso'
import { fmtDataHora, fmtHoras } from '../../lib/formato'
import { msgErro, ok, supabase } from '../../lib/supabase'
import type { ConsultaRa, Curso, EventoPublico, TipoParticipante } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Campo, Cartao, Carregando, Entrada, Titulo } from '../../ui'
import { CamposCadastro, paraLinha, type DadosCadastro } from '../CamposCadastro'
import { CamposPerguntas } from '../Perguntas'

type Etapa = 'identificar' | 'formulario' | 'pronto'

export default function Inscricao() {
  const { id } = useParams()
  const d = useDados(async () => {
    const [evs, cursos] = await Promise.all([
      supabase.rpc('listar_eventos_abertos'),
      supabase.from('cursos').select('id, nome').order('nome'),
    ])
    return {
      evento: (ok(evs) as EventoPublico[]).find((e) => String(e.id) === id) ?? null,
      cursos: ok(cursos) as Curso[],
    }
  }, [id])

  const [etapa, setEtapa] = useState<Etapa>('identificar')
  const [tipo, setTipo] = useState<TipoParticipante>('aluno_unicamp')
  const [ra, setRa] = useState(raSalvo())
  const [conhecido, setConhecido] = useState<string | null>(null) // primeiro nome de quem já tem cadastro
  const [email, setEmail] = useState('')
  const [cad, setCad] = useState<DadosCadastro>({
    nome: '', tipo: 'aluno_unicamp', ra: '', curso_id: '', ano_ingresso: '', celular: '', idade: '', genero: '', na_comunidade: '',
  })
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ status: string; primeiro_nome: string } | null>(null)

  if (d.carregando && !d.dados) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>
  const e = d.dados!.evento
  if (!e) {
    return (
      <Cartao>
        <p className="text-sm">Este evento não está com inscrições abertas. <Link className="text-marca-700 underline" to="/">Ver próximos eventos</Link></p>
      </Cartao>
    )
  }

  async function identificar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)
    if (tipo === 'externo') {
      setConhecido(null)
      setCad({ ...cad, tipo: 'externo' })
      return setEtapa('formulario')
    }
    if (!raValido(ra)) return setErro('Digite um RA com 5 ou 6 dígitos.')
    setOcupado(true)
    const { data, error } = await supabase.rpc('consultar_ra', { p_ra: ra })
    setOcupado(false)
    if (error) return setErro(msgErro(error))
    salvarRa(ra)
    setConhecido((data as ConsultaRa | null)?.primeiro_nome ?? null)
    setCad({ ...cad, tipo: 'aluno_unicamp' })
    setEtapa('formulario')
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)
    setOcupado(true)
    const { data, error } = await supabase.rpc('inscrever_publico', {
      p_evento_id: e!.id,
      p_ra: tipo === 'aluno_unicamp' ? limparRa(ra) : null,
      p_email: email,
      p_dados: conhecido ? {} : paraLinha(cad),
      p_respostas: respostas,
    })
    setOcupado(false)
    if (error) return setErro(msgErro(error))
    setResultado(data as { status: string; primeiro_nome: string })
    setEtapa('pronto')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Titulo sub={<>{fmtDataHora(e.inicio)} · {fmtHoras(e.horas)}{e.local && <> · {e.local}</>}</>}>{e.titulo}</Titulo>
      {e.descricao && <Cartao className="mb-6"><p className="whitespace-pre-line text-sm text-stone-700">{e.descricao}</p></Cartao>}

      {etapa === 'pronto' && resultado ? (
        <Cartao>
          {resultado.status === 'lista_espera' ? (
            <Aviso tom="amarelo">
              {resultado.primeiro_nome}, o evento está lotado: você entrou na <strong>lista de espera</strong> e será promovido(a)
              automaticamente se abrir uma vaga. Acompanhe pela consulta do seu RA.
            </Aviso>
          ) : (
            <Aviso tom="verde">Inscrição confirmada, {resultado.primeiro_nome}! Até lá. 🌱</Aviso>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {tipo === 'aluno_unicamp' && <Link to="/consulta"><Botao>Ver minhas horas e inscrições</Botao></Link>}
            <Link to="/"><Botao variante="secundario">Voltar aos eventos</Botao></Link>
          </div>
        </Cartao>
      ) : etapa === 'identificar' ? (
        <Cartao titulo="Inscrição">
          <form onSubmit={identificar} className="space-y-4">
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-2 text-sm font-medium text-stone-700">Você é…</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="tipo" checked={tipo === 'aluno_unicamp'} onChange={() => setTipo('aluno_unicamp')} /> Aluno(a) da Unicamp
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="tipo" checked={tipo === 'externo'} onChange={() => setTipo('externo')} /> Comunidade externa
              </label>
            </fieldset>
            {tipo === 'aluno_unicamp' && (
              <Campo rotulo="RA">
                <Entrada inputMode="numeric" required value={ra} onChange={(x) => setRa(limparRa(x.target.value))} placeholder="Ex.: 123456" />
              </Campo>
            )}
            <Aviso>{erro}</Aviso>
            <Botao type="submit" carregando={ocupado}>Continuar</Botao>
          </form>
        </Cartao>
      ) : (
        <Cartao
          titulo={conhecido ? `Olá, ${conhecido}!` : tipo === 'externo' ? 'Seus dados' : 'Primeira vez no Mutirões? Complete seu cadastro'}
          acoes={<Botao variante="fantasma" onClick={() => { setEtapa('identificar'); setErro(null) }}>Voltar</Botao>}
        >
          <form onSubmit={enviar} className="space-y-5">
            <Campo
              rotulo={conhecido ? 'Confirme o e-mail cadastrado' : 'E-mail'}
              dica={conhecido ? 'O mesmo e-mail que você usou nas inscrições anteriores.' : tipo === 'externo' ? 'Se você já participou, use o mesmo e-mail de antes.' : undefined}
            >
              <Entrada type="email" required autoComplete="email" value={email} onChange={(x) => setEmail(x.target.value)} />
            </Campo>
            {!conhecido && <CamposCadastro d={cad} set={setCad} cursos={d.dados!.cursos} podeEditarIdentidade mostrarIdentidade={false} />}
            {e.perguntas.length > 0 && (
              <div className="border-t border-stone-100 pt-4">
                <CamposPerguntas perguntas={e.perguntas} respostas={respostas} set={setRespostas} />
              </div>
            )}
            <p className="text-xs text-stone-500">
              Seus dados são usados apenas pela organização do Mutirões para gerenciar inscrições, presenças e horas de extensão.
            </p>
            <Aviso>{erro}</Aviso>
            <Botao type="submit" carregando={ocupado}>{e.vagas_restantes === 0 ? 'Entrar na lista de espera' : 'Confirmar inscrição'}</Botao>
          </form>
        </Cartao>
      )}
    </div>
  )
}
