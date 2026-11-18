import { useState, type FormEvent } from 'react'
import { fmtDataHora, fmtHoras, ROTULO_INSCRICAO, TOM_INSCRICAO } from '../../lib/formato'
import { msgErro, ok, supabase } from '../../lib/supabase'
import type { EventoAluno } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Cartao, Carregando, Selo, Titulo, Vazio } from '../../ui'
import { CamposPerguntas } from '../Perguntas'

export default function EventosAluno() {
  const d = useDados(async () => ok(await supabase.rpc('listar_eventos_aluno')) as EventoAluno[], [])

  if (d.carregando && !d.dados) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>

  const agora = Date.now()
  const proximos = d.dados!.filter((e) => new Date(e.inicio).getTime() >= agora && e.status !== 'cancelado' && e.status !== 'realizado')
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())

  return (
    <>
      <Titulo sub="Inscreva-se nos próximos mutirões. Sua presença é confirmada pela organização no dia.">Eventos</Titulo>
      {proximos.length === 0 ? (
        <Cartao><Vazio>Nenhum evento com inscrições no momento. Fique de olho na comunidade do WhatsApp!</Vazio></Cartao>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {proximos.map((e) => <CartaoEvento key={e.id} e={e} aoMudar={d.recarregar} />)}
        </div>
      )}
    </>
  )
}

function CartaoEvento({ e, aoMudar }: { e: EventoAluno; aoMudar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'verde' | 'vermelho' | 'amarelo'; texto: string } | null>(null)

  const ativa = e.minha_inscricao && e.minha_inscricao !== 'cancelada'
  const abertas = e.status === 'inscricoes_abertas' && (!e.inscricoes_ate || new Date(e.inscricoes_ate).getTime() > Date.now())
  const lotado = e.vagas_restantes === 0

  async function inscrever(ev: FormEvent) {
    ev.preventDefault()
    setMsg(null)
    setOcupado(true)
    const { data, error } = await supabase.rpc('inscrever_em_evento', { p_evento_id: e.id, p_respostas: respostas })
    setOcupado(false)
    if (error) return setMsg({ tom: 'vermelho', texto: msgErro(error) })
    setMsg(
      data === 'lista_espera'
        ? { tom: 'amarelo', texto: 'O evento está lotado: você entrou na lista de espera e será promovido(a) se abrir vaga.' }
        : { tom: 'verde', texto: 'Inscrição confirmada! Até lá.' },
    )
    setAberto(false)
    aoMudar()
  }

  async function cancelar() {
    if (!confirm('Cancelar sua inscrição neste evento?')) return
    setMsg(null)
    setOcupado(true)
    const { error } = await supabase.rpc('cancelar_inscricao', { p_evento_id: e.id })
    setOcupado(false)
    if (error) return setMsg({ tom: 'vermelho', texto: msgErro(error) })
    setMsg({ tom: 'verde', texto: 'Inscrição cancelada.' })
    aoMudar()
  }

  return (
    <Cartao
      titulo={e.titulo}
      acoes={ativa ? <Selo tom={TOM_INSCRICAO[e.minha_inscricao!]}>{ROTULO_INSCRICAO[e.minha_inscricao!]}</Selo> : undefined}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-stone-500">Quando</dt><dd>{fmtDataHora(e.inicio)}</dd>
        {e.local && (<><dt className="text-stone-500">Onde</dt><dd>{e.local}</dd></>)}
        <dt className="text-stone-500">Horas</dt><dd>{fmtHoras(e.horas)}</dd>
        {e.vagas !== null && (<><dt className="text-stone-500">Vagas</dt><dd>{e.vagas_restantes} de {e.vagas} restantes</dd></>)}
        {e.inscricoes_ate && (<><dt className="text-stone-500">Inscrições até</dt><dd>{fmtDataHora(e.inscricoes_ate)}</dd></>)}
      </dl>
      {e.descricao && <p className="mt-3 whitespace-pre-line text-sm text-stone-700">{e.descricao}</p>}

      <div className="mt-4 space-y-3">
        {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
        {ativa ? (
          <Botao variante="secundario" onClick={cancelar} carregando={ocupado}>Cancelar inscrição</Botao>
        ) : !abertas ? (
          <p className="text-sm text-stone-500">Inscrições encerradas.</p>
        ) : !aberto ? (
          <Botao onClick={() => (e.perguntas.length ? setAberto(true) : inscrever({ preventDefault() {} } as FormEvent))} carregando={ocupado}>
            {lotado ? 'Entrar na lista de espera' : 'Quero participar'}
          </Botao>
        ) : (
          <form onSubmit={inscrever} className="space-y-3 rounded-lg bg-stone-50 p-3">
            <CamposPerguntas perguntas={e.perguntas} respostas={respostas} set={setRespostas} />
            <div className="flex gap-2">
              <Botao type="submit" carregando={ocupado}>Confirmar inscrição</Botao>
              <Botao type="button" variante="fantasma" onClick={() => setAberto(false)}>Voltar</Botao>
            </div>
          </form>
        )}
      </div>
    </Cartao>
  )
}
