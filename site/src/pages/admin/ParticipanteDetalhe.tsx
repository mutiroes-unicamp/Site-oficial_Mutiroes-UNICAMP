import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { carregarCursos } from '../../lib/admin'
import {
  fmtData, fmtDataHora, fmtHoras, ROTULO_INSCRICAO, ROTULO_SOLICITACAO, TOM_SOLICITACAO,
} from '../../lib/formato'
import { msgErro, ok, supabase } from '../../lib/supabase'
import type { Ajuste, Evento, Inscricao, Participante, Saldo, Solicitacao, StatusInscricao } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { AreaTexto, Aviso, Botao, Campo, Cartao, Carregando, Entrada, Numero, RolagemTabela, Selecao, Selo, Titulo, Vazio } from '../../ui'
import { CamposCadastro, deParticipante, paraLinha, type DadosCadastro } from '../CamposCadastro'

type InscEv = Inscricao & { eventos: Pick<Evento, 'id' | 'titulo' | 'inicio' | 'horas'> }

export default function ParticipanteDetalhe() {
  const { id } = useParams()
  const d = useDados(async () => {
    const [p, s, i, a, so, cursos] = await Promise.all([
      supabase.from('participantes').select('*').eq('id', id!).single(),
      supabase.from('saldo_horas').select('*').eq('participante_id', id!).maybeSingle(),
      supabase.from('inscricoes').select('*, eventos(id, titulo, inicio, horas)').eq('participante_id', id!),
      supabase.from('ajustes_horas').select('*').eq('participante_id', id!).order('criado_em', { ascending: false }),
      supabase.from('solicitacoes_validacao').select('*').eq('participante_id', id!).order('solicitado_em', { ascending: false }),
      carregarCursos(),
    ])
    return {
      p: ok(p) as Participante,
      saldo: ok(s) as Saldo | null,
      inscricoes: (ok(i) as InscEv[]).sort((x, y) => y.eventos.inicio.localeCompare(x.eventos.inicio)),
      ajustes: ok(a) as Ajuste[],
      solicitacoes: ok(so) as Solicitacao[],
      cursos,
    }
  }, [id])
  const [erro, setErro] = useState<string | null>(null)

  if (d.carregando && !d.dados) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>
  const { p, saldo, inscricoes, ajustes, solicitacoes, cursos } = d.dados!

  async function acao(f: () => PromiseLike<{ error: unknown }>) {
    setErro(null)
    const { error } = await f()
    if (error) setErro(msgErro(error))
    void d.recarregar()
  }

  return (
    <>
      <Titulo sub={<>{p.email}{p.ra && <> · RA {p.ra}</>} · {p.user_id ? 'já acessou o site' : 'ainda não acessou o site'}</>}>
        {p.nome}
      </Titulo>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Acumuladas" valor={fmtHoras(saldo?.horas_acumuladas)} />
        <Numero rotulo="Validadas" valor={fmtHoras(saldo?.horas_validadas)} />
        <Numero rotulo="Pendentes" valor={fmtHoras(saldo?.horas_pendentes)} />
        <Numero rotulo="Disponíveis" valor={fmtHoras(saldo?.horas_disponiveis)} destaque />
      </div>
      <div className="mt-4"><Aviso>{erro}</Aviso></div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <EditarCadastro p={p} cursos={cursos} aoSalvar={d.recarregar} />

        <div className="space-y-6">
          <Cartao titulo={`Participações (${inscricoes.length})`}>
            {inscricoes.length === 0 ? <Vazio>Nenhuma inscrição.</Vazio> : (
              <RolagemTabela>
                <table className="tabela">
                  <thead><tr><th>Evento</th><th>Data</th><th>Situação</th><th className="text-right">Horas</th></tr></thead>
                  <tbody>
                    {inscricoes.map((i) => (
                      <tr key={i.id}>
                        <td><Link className="hover:underline" to={`/admin/eventos/${i.eventos.id}`}>{i.eventos.titulo}</Link></td>
                        <td className="whitespace-nowrap">{fmtData(i.eventos.inicio)}</td>
                        <td>
                          <Selecao className="w-36 py-1" value={i.status} aria-label="Situação"
                            onChange={(e) => acao(() => supabase.from('inscricoes').update({ status: e.target.value as StatusInscricao }).eq('id', i.id))}>
                            {Object.entries(ROTULO_INSCRICAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </Selecao>
                        </td>
                        <td className="text-right">{i.status === 'presente' ? fmtHoras(i.eventos.horas) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </RolagemTabela>
            )}
          </Cartao>

          <Ajustes pid={p.id} ajustes={ajustes} acao={acao} />

          <Cartao titulo="Solicitações de validação">
            {solicitacoes.length === 0 ? <Vazio>Nenhuma.</Vazio> : (
              <ul className="divide-y divide-stone-100 text-sm">
                {solicitacoes.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <span className="font-medium">{fmtHoras(s.horas)}</span>{' '}
                      <span className="text-xs text-stone-500">em {fmtDataHora(s.solicitado_em)}</span>
                      {s.observacao && <div className="text-xs text-stone-500">{s.observacao}</div>}
                    </div>
                    <Selo tom={TOM_SOLICITACAO[s.status]}>{ROTULO_SOLICITACAO[s.status]}</Selo>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-stone-500">Aprove ou recuse em <Link className="underline" to="/admin/solicitacoes">Validações</Link>.</p>
          </Cartao>
        </div>
      </div>
    </>
  )
}

function EditarCadastro({ p, cursos, aoSalvar }: { p: Participante; cursos: { id: number; nome: string }[]; aoSalvar: () => void }) {
  const [d, setD] = useState<DadosCadastro>(() => deParticipante(p))
  const [email, setEmail] = useState(p.email)
  const [obs, setObs] = useState(p.observacoes ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'verde' | 'vermelho'; texto: string } | null>(null)
  useEffect(() => { setD(deParticipante(p)); setEmail(p.email); setObs(p.observacoes ?? '') }, [p])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setOcupado(true)
    const { error } = await supabase.from('participantes').update({
      ...paraLinha(d), tipo: d.tipo, ra: d.tipo === 'aluno_unicamp' ? d.ra.trim() || null : null,
      email: email.trim().toLowerCase(), observacoes: obs.trim() || null,
    }).eq('id', p.id)
    setOcupado(false)
    if (error) return setMsg({ tom: 'vermelho', texto: msgErro(error) })
    setMsg({ tom: 'verde', texto: 'Cadastro salvo.' })
    aoSalvar()
  }

  async function desvincular() {
    if (!confirm('Desvincular a conta de acesso? A pessoa precisará entrar de novo com o e-mail do cadastro.')) return
    const { error } = await supabase.from('participantes').update({ user_id: null }).eq('id', p.id)
    if (error) setMsg({ tom: 'vermelho', texto: msgErro(error) })
    aoSalvar()
  }

  return (
    <Cartao titulo="Cadastro">
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="E-mail" dica="É por ele que a pessoa entra no site e recupera o histórico.">
          <Entrada type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <CamposCadastro d={d} set={setD} cursos={cursos} podeEditarIdentidade />
        <Campo rotulo="Observações internas"><AreaTexto rows={3} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
        <p className="text-xs text-stone-500">Cadastrado em {fmtData(p.criado_em)}.</p>
        {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" carregando={ocupado}>Salvar cadastro</Botao>
          {p.user_id && <Botao type="button" variante="fantasma" onClick={desvincular}>Desvincular conta</Botao>}
        </div>
      </form>
    </Cartao>
  )
}

function Ajustes({ pid, ajustes, acao }: { pid: string; ajustes: Ajuste[]; acao: (f: () => PromiseLike<{ error: unknown }>) => Promise<void> }) {
  const [horas, setHoras] = useState('')
  const [motivo, setMotivo] = useState('')

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    await acao(() => supabase.from('ajustes_horas').insert({ participante_id: pid, horas: Number(horas.replace(',', '.')), motivo: motivo.trim() }))
    setHoras('')
    setMotivo('')
  }

  return (
    <Cartao titulo="Ajustes manuais de horas">
      {ajustes.length > 0 && (
        <ul className="mb-4 divide-y divide-stone-100 text-sm">
          {ajustes.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <div>{a.motivo}</div>
                <div className="text-xs text-stone-500">{fmtDataHora(a.criado_em)}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap font-medium">{a.horas > 0 ? '+' : ''}{fmtHoras(a.horas)}</span>
                <button className="text-xs text-red-700 hover:underline"
                  onClick={() => confirm('Remover este ajuste?') && acao(() => supabase.from('ajustes_horas').delete().eq('id', a.id))}>
                  remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={adicionar} className="grid gap-2 sm:grid-cols-[6rem_1fr_auto]">
        <Entrada type="number" step={0.5} required placeholder="±h" value={horas} onChange={(e) => setHoras(e.target.value)} aria-label="Horas" />
        <Entrada required placeholder="Motivo (obrigatório)" value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo" />
        <Botao type="submit" variante="secundario">Adicionar</Botao>
      </form>
      <p className="mt-2 text-xs text-stone-500">Use para horas fora de eventos cadastrados. Valores negativos descontam.</p>
    </Cartao>
  )
}
