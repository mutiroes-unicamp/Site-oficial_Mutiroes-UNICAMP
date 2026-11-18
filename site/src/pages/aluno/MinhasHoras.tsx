import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth'
import {
  fmtData, fmtDataHora, fmtHoras, ROTULO_INSCRICAO, ROTULO_SOLICITACAO, TOM_INSCRICAO, TOM_SOLICITACAO,
} from '../../lib/formato'
import { msgErro, ok, supabase } from '../../lib/supabase'
import type { Ajuste, Evento, Inscricao, Saldo, Solicitacao } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Campo, Cartao, Carregando, Entrada, Numero, RolagemTabela, Selo, Titulo, Vazio } from '../../ui'

type InscricaoEv = Inscricao & { eventos: Pick<Evento, 'titulo' | 'inicio' | 'horas' | 'status' | 'local'> }

export default function MinhasHoras() {
  const { participante } = useAuth()
  const pid = participante!.id

  const d = useDados(async () => {
    const [saldo, insc, sol, aj] = await Promise.all([
      supabase.from('saldo_horas').select('*').eq('participante_id', pid).maybeSingle(),
      supabase.from('inscricoes').select('*, eventos(titulo, inicio, horas, status, local)').eq('participante_id', pid),
      supabase.from('solicitacoes_validacao').select('*').eq('participante_id', pid).order('solicitado_em', { ascending: false }),
      supabase.from('ajustes_horas').select('*').eq('participante_id', pid).order('criado_em', { ascending: false }),
    ])
    const inscricoes = (ok(insc) as InscricaoEv[]).sort((a, b) => b.eventos.inicio.localeCompare(a.eventos.inicio))
    return {
      saldo: ok(saldo) as Saldo | null,
      inscricoes,
      solicitacoes: ok(sol) as Solicitacao[],
      ajustes: ok(aj) as Ajuste[],
    }
  }, [pid])

  if (d.carregando && !d.dados) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>
  const { saldo, inscricoes, solicitacoes, ajustes } = d.dados!
  const presencas = inscricoes.filter((i) => i.status === 'presente')
  const pendente = solicitacoes.find((s) => s.status === 'pendente')

  return (
    <>
      <Titulo sub={`Olá, ${participante!.nome.split(' ')[0]}! Aqui estão suas presenças e horas de extensão.`}>Minhas horas</Titulo>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Acumuladas" valor={fmtHoras(saldo?.horas_acumuladas)} />
        <Numero rotulo="Já validadas" valor={fmtHoras(saldo?.horas_validadas)} />
        <Numero rotulo="Em análise" valor={fmtHoras(saldo?.horas_pendentes)} />
        <Numero rotulo="Disponíveis p/ validar" valor={fmtHoras(saldo?.horas_disponiveis)} destaque />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Cartao
            titulo={`Participações (${presencas.length} presença${presencas.length === 1 ? '' : 's'})`}
            acoes={<Link to="/eventos" className="text-sm font-medium text-marca-700 hover:underline">Ver eventos abertos →</Link>}
          >
            {inscricoes.length === 0 ? (
              <Vazio>Você ainda não participou de eventos. <Link className="text-marca-700 underline" to="/eventos">Inscreva-se!</Link></Vazio>
            ) : (
              <RolagemTabela>
                <table className="tabela">
                  <thead>
                    <tr><th>Evento</th><th>Data</th><th>Situação</th><th className="text-right">Horas</th></tr>
                  </thead>
                  <tbody>
                    {inscricoes.map((i) => (
                      <tr key={i.id}>
                        <td className="font-medium">{i.eventos.titulo}</td>
                        <td className="whitespace-nowrap">{fmtData(i.eventos.inicio)}</td>
                        <td><Selo tom={TOM_INSCRICAO[i.status]}>{ROTULO_INSCRICAO[i.status]}</Selo></td>
                        <td className="whitespace-nowrap text-right">{i.status === 'presente' ? fmtHoras(i.eventos.horas) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </RolagemTabela>
            )}
            <p className="mt-3 text-xs text-stone-500">
              A presença é registrada pela organização no dia do evento. Viu algo errado? Fale com a organização.
            </p>
          </Cartao>

          {ajustes.length > 0 && (
            <Cartao titulo="Ajustes de horas feitos pela organização">
              <ul className="divide-y divide-stone-100 text-sm">
                {ajustes.map((a) => (
                  <li key={a.id} className="flex justify-between gap-4 py-2">
                    <span>{a.motivo}</span>
                    <span className="whitespace-nowrap font-medium">{a.horas > 0 ? '+' : ''}{fmtHoras(a.horas)}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>

        <div className="space-y-6">
          <SolicitarValidacao disponiveis={Number(saldo?.horas_disponiveis ?? 0)} pendente={!!pendente} aoSolicitar={d.recarregar} />
          <Cartao titulo="Minhas solicitações">
            {solicitacoes.length === 0 ? (
              <Vazio>Nenhuma solicitação ainda.</Vazio>
            ) : (
              <ul className="divide-y divide-stone-100 text-sm">
                {solicitacoes.map((s) => (
                  <li key={s.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{fmtHoras(s.horas)}</span>
                      <Selo tom={TOM_SOLICITACAO[s.status]}>{ROTULO_SOLICITACAO[s.status]}</Selo>
                    </div>
                    <div className="text-xs text-stone-500">Pedido em {fmtDataHora(s.solicitado_em)}</div>
                    {s.observacao && s.status === 'recusada' && <div className="mt-1 text-xs text-red-700">{s.observacao}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  )
}

function SolicitarValidacao({ disponiveis, pendente, aoSolicitar }: { disponiveis: number; pendente: boolean; aoSolicitar: () => void }) {
  const [horas, setHoras] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'verde' | 'vermelho'; texto: string } | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setOcupado(true)
    const { error } = await supabase.rpc('solicitar_validacao', { p_horas: Number(horas.replace(',', '.')) })
    setOcupado(false)
    if (error) return setMsg({ tom: 'vermelho', texto: msgErro(error) })
    setMsg({ tom: 'verde', texto: 'Solicitação enviada! A organização vai analisar e você verá o resultado aqui.' })
    setHoras('')
    aoSolicitar()
  }

  return (
    <Cartao titulo="Solicitar validação de horas">
      {pendente ? (
        <Aviso tom="amarelo">Você já tem uma solicitação em análise. Aguarde a resposta para pedir de novo.</Aviso>
      ) : disponiveis <= 0 ? (
        <Vazio>Você não tem horas disponíveis para validar no momento.</Vazio>
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <Campo rotulo="Quantas horas?" dica={`Você pode pedir até ${fmtHoras(disponiveis)}.`}>
            <Entrada type="number" required min={0.5} max={disponiveis} step={0.5} value={horas} onChange={(e) => setHoras(e.target.value)} />
          </Campo>
          <Botao type="submit" carregando={ocupado} className="w-full">Solicitar validação</Botao>
        </form>
      )}
      {msg && <div className="mt-3"><Aviso tom={msg.tom}>{msg.texto}</Aviso></div>}
    </Cartao>
  )
}
