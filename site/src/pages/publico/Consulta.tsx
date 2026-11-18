import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { raSalvo, salvarRa } from '../../lib/acesso'
import {
  fmtData, fmtDataHora, fmtHoras, ROTULO_INSCRICAO, ROTULO_SOLICITACAO, TOM_INSCRICAO, TOM_SOLICITACAO,
} from '../../lib/formato'
import { msgErro, ok, supabase } from '../../lib/supabase'
import type { ConsultaRa } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Campo, Cartao, Carregando, Entrada, Numero, RolagemTabela, Selo, Titulo, Vazio } from '../../ui'

export default function Consulta() {
  const ra = raSalvo()
  const nav = useNavigate()
  const d = useDados(async () => ok(await supabase.rpc('consultar_ra', { p_ra: ra })) as ConsultaRa | null, [ra])

  if (!ra) return <Navigate to="/" replace />
  if (d.carregando && d.dados === null && !d.erro) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>

  const trocar = () => { salvarRa(null); nav('/') }

  if (!d.dados) {
    return (
      <div className="mx-auto max-w-lg">
        <Titulo>RA {ra}</Titulo>
        <Cartao>
          <p className="text-sm text-stone-700">
            Não encontramos participações para este RA. Se você já participou de algum mutirão, confira o número ou fale com a organização.
            Se ainda não participou, <Link className="font-medium text-marca-700 underline" to="/">inscreva-se em um evento</Link>!
          </p>
          <div className="mt-4"><Botao variante="secundario" onClick={trocar}>Consultar outro RA</Botao></div>
        </Cartao>
      </div>
    )
  }

  const c = d.dados
  const pendente = c.solicitacoes.some((s) => s.status === 'pendente')
  const presencas = c.participacoes.filter((p) => p.status === 'presente').length
  const agora = Date.now()

  return (
    <>
      <Titulo
        sub={`RA ${ra} · aqui estão suas presenças e horas de extensão`}
        acoes={<Botao variante="secundario" onClick={trocar}>Consultar outro RA</Botao>}
      >
        Olá, {c.primeiro_nome}!
      </Titulo>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Acumuladas" valor={fmtHoras(c.horas?.horas_acumuladas)} />
        <Numero rotulo="Já validadas" valor={fmtHoras(c.horas?.horas_validadas)} />
        <Numero rotulo="Em análise" valor={fmtHoras(c.horas?.horas_pendentes)} />
        <Numero rotulo="Disponíveis p/ validar" valor={fmtHoras(c.horas?.horas_disponiveis)} destaque />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Cartao
            titulo={`Participações (${presencas} presença${presencas === 1 ? '' : 's'})`}
            acoes={<Link to="/" className="text-sm font-medium text-marca-700 hover:underline">Ver próximos eventos →</Link>}
          >
            {c.participacoes.length === 0 ? (
              <Vazio>Nenhuma participação registrada ainda.</Vazio>
            ) : (
              <RolagemTabela>
                <table className="tabela">
                  <thead><tr><th>Evento</th><th>Data</th><th>Situação</th><th className="text-right">Horas</th><th /></tr></thead>
                  <tbody>
                    {c.participacoes.map((p) => {
                      const podeCancelar = ['inscrito', 'lista_espera'].includes(p.status) && new Date(p.inicio).getTime() > agora
                        && ['inscricoes_abertas', 'inscricoes_encerradas'].includes(p.status_evento)
                      return (
                        <tr key={p.evento_id}>
                          <td className="font-medium">{p.titulo}</td>
                          <td className="whitespace-nowrap">{fmtData(p.inicio)}</td>
                          <td><Selo tom={TOM_INSCRICAO[p.status]}>{ROTULO_INSCRICAO[p.status]}</Selo></td>
                          <td className="whitespace-nowrap text-right">{p.status === 'presente' ? fmtHoras(p.horas) : '—'}</td>
                          <td>{podeCancelar && <Cancelar eventoId={p.evento_id} ra={ra} aoCancelar={d.recarregar} />}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </RolagemTabela>
            )}
            <p className="mt-3 text-xs text-stone-500">A presença é registrada pela organização no dia do evento. Viu algo errado? Fale com a organização.</p>
          </Cartao>

          {c.ajustes.length > 0 && (
            <Cartao titulo="Ajustes de horas feitos pela organização">
              <ul className="divide-y divide-stone-100 text-sm">
                {c.ajustes.map((a, i) => (
                  <li key={i} className="flex justify-between gap-4 py-2">
                    <span>{a.motivo}</span>
                    <span className="whitespace-nowrap font-medium">{a.horas > 0 ? '+' : ''}{fmtHoras(a.horas)}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>

        <div className="space-y-6">
          <SolicitarValidacao ra={ra} disponiveis={Number(c.horas?.horas_disponiveis ?? 0)} pendente={pendente} aoSolicitar={d.recarregar} />
          <Cartao titulo="Minhas solicitações">
            {c.solicitacoes.length === 0 ? (
              <Vazio>Nenhuma solicitação ainda.</Vazio>
            ) : (
              <ul className="divide-y divide-stone-100 text-sm">
                {c.solicitacoes.map((s, i) => (
                  <li key={i} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{fmtHoras(s.horas)}</span>
                      <Selo tom={TOM_SOLICITACAO[s.status]}>{ROTULO_SOLICITACAO[s.status]}</Selo>
                    </div>
                    <div className="text-xs text-stone-500">Pedido em {fmtDataHora(s.solicitado_em)}</div>
                    {s.observacao && <div className="mt-1 text-xs text-red-700">{s.observacao}</div>}
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

function SolicitarValidacao({ ra, disponiveis, pendente, aoSolicitar }: { ra: string; disponiveis: number; pendente: boolean; aoSolicitar: () => void }) {
  const [horas, setHoras] = useState('')
  const [email, setEmail] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'verde' | 'vermelho'; texto: string } | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setOcupado(true)
    const { error } = await supabase.rpc('solicitar_validacao_publico', {
      p_ra: ra, p_email: email, p_horas: Number(horas.replace(',', '.')),
    })
    setOcupado(false)
    if (error) return setMsg({ tom: 'vermelho', texto: msgErro(error) })
    setMsg({ tom: 'verde', texto: 'Solicitação enviada! A organização vai analisar e o resultado aparece aqui.' })
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
          <Campo rotulo="Confirme seu e-mail cadastrado" dica="Para garantir que é você quem está pedindo.">
            <Entrada type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Botao type="submit" carregando={ocupado} className="w-full">Solicitar validação</Botao>
        </form>
      )}
      {msg && <div className="mt-3"><Aviso tom={msg.tom}>{msg.texto}</Aviso></div>}
    </Cartao>
  )
}

function Cancelar({ eventoId, ra, aoCancelar }: { eventoId: number; ra: string; aoCancelar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    const { error } = await supabase.rpc('cancelar_inscricao_publico', { p_evento_id: eventoId, p_ra: ra, p_email: email })
    setOcupado(false)
    if (error) return setErro(msgErro(error))
    aoCancelar()
  }

  if (!aberto) return <button className="text-xs text-red-700 hover:underline" onClick={() => setAberto(true)}>cancelar</button>
  return (
    <form onSubmit={confirmar} className="min-w-56 space-y-2">
      <Entrada type="email" required placeholder="E-mail cadastrado" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail cadastrado" />
      {erro && <p className="text-xs text-red-700">{erro}</p>}
      <div className="flex gap-1">
        <Botao type="submit" variante="perigo" carregando={ocupado} className="px-2 py-1 text-xs">Cancelar inscrição</Botao>
        <Botao type="button" variante="fantasma" className="px-2 py-1 text-xs" onClick={() => setAberto(false)}>Voltar</Botao>
      </div>
    </form>
  )
}
