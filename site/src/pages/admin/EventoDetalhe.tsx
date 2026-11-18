import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { baixarCsv } from '../../lib/csv'
import { fmtDataHora, fmtHoras, ROTULO_EVENTO, ROTULO_INSCRICAO, TOM_EVENTO } from '../../lib/formato'
import { msgErro, supabase } from '../../lib/supabase'
import type { StatusEvento, StatusInscricao } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Cartao, Carregando, RolagemTabela, Selecao, Selo, Titulo, Vazio } from '../../ui'
import { rotuloResposta } from '../Perguntas'
import { BuscaParticipante } from './BuscaParticipante'
import { carregarEventoComInscritos } from './inscritos'

const PROXIMO: Partial<Record<StatusEvento, { para: StatusEvento; rotulo: string }[]>> = {
  planejado: [{ para: 'inscricoes_abertas', rotulo: 'Abrir inscrições' }],
  inscricoes_abertas: [{ para: 'inscricoes_encerradas', rotulo: 'Encerrar inscrições' }],
  inscricoes_encerradas: [
    { para: 'inscricoes_abertas', rotulo: 'Reabrir inscrições' },
    { para: 'realizado', rotulo: 'Marcar como realizado' },
  ],
  realizado: [{ para: 'inscricoes_encerradas', rotulo: 'Desfazer “realizado”' }],
  cancelado: [{ para: 'planejado', rotulo: 'Voltar para rascunho' }],
}

export default function EventoDetalhe() {
  const { id } = useParams()
  const d = useDados(() => carregarEventoComInscritos(id!), [id])
  const [filtro, setFiltro] = useState<StatusInscricao | ''>('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const chaves = useMemo(() => {
    // colunas de respostas: perguntas atuais + chaves antigas vindas dos Forms
    const s = new Set<string>((d.dados?.evento.perguntas ?? []).map((p) => p.id))
    d.dados?.inscritos.forEach((i) => Object.keys(i.respostas ?? {}).forEach((k) => s.add(k)))
    return [...s]
  }, [d.dados])

  if (d.carregando && !d.dados) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>
  const { evento: e, inscritos } = d.dados!
  const lista = filtro ? inscritos.filter((i) => i.status === filtro) : inscritos
  const cont = (s: StatusInscricao) => inscritos.filter((i) => i.status === s).length
  const ativos = inscritos.filter((i) => ['inscrito', 'presente', 'ausente'].includes(i.status)).length

  async function acao(f: () => PromiseLike<{ error: unknown }>) {
    setErro(null)
    setOcupado(true)
    const { error } = await f()
    setOcupado(false)
    if (error) setErro(msgErro(error))
    else void d.recarregar()
  }

  const mudarEvento = (status: StatusEvento) => acao(() => supabase.from('eventos').update({ status }).eq('id', e.id))
  const mudarInscricao = (iid: number, status: StatusInscricao) => acao(() => supabase.from('inscricoes').update({ status }).eq('id', iid))

  function exportar() {
    baixarCsv(
      `inscritos-${e.titulo}`,
      ['Nome', 'E-mail', 'RA', 'Vínculo', 'Curso', 'Celular', 'Situação', 'Origem', 'Inscrito em', ...chaves.map((k) => rotuloResposta(e.perguntas, k))],
      inscritos.map((i) => [
        i.participantes.nome, i.participantes.email, i.participantes.ra, i.participantes.tipo === 'externo' ? 'Externo' : 'Aluno Unicamp',
        i.participantes.cursos?.nome, i.participantes.celular, ROTULO_INSCRICAO[i.status], i.origem, fmtDataHora(i.criado_em),
        ...chaves.map((k) => i.respostas?.[k]),
      ]),
    )
  }

  return (
    <>
      <Titulo
        sub={
          <>
            {fmtDataHora(e.inicio)} · {fmtHoras(e.horas)} · {e.local ?? 'local a definir'}
            {e.categorias_evento && <> · {e.categorias_evento.nome}</>}
            {(e.edicao || e.codigo_legado) && <> · {[e.edicao, e.codigo_legado].filter(Boolean).join(' · ')}</>}
          </>
        }
        acoes={
          <>
            <Link to={`/admin/eventos/${e.id}/presenca`}><Botao>Lista de presença</Botao></Link>
            <Link to={`/admin/eventos/${e.id}/editar`}><Botao variante="secundario">Editar</Botao></Link>
          </>
        }
      >
        {e.titulo}
      </Titulo>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Selo tom={TOM_EVENTO[e.status]}>{ROTULO_EVENTO[e.status]}</Selo>
        {(PROXIMO[e.status] ?? []).map((p) => (
          <Botao key={p.para} variante="secundario" carregando={ocupado} onClick={() => mudarEvento(p.para)}>{p.rotulo}</Botao>
        ))}
        {e.status !== 'cancelado' && e.status !== 'realizado' && (
          <Botao variante="fantasma" onClick={() => confirm('Cancelar este evento?') && mudarEvento('cancelado')}>Cancelar evento</Botao>
        )}
      </div>
      <Aviso>{erro}</Aviso>

      <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {([['Inscritos', ativos + (e.vagas ? `/${e.vagas}` : '')], ['Presentes', cont('presente')], ['Ausentes', cont('ausente')],
          ['Lista de espera', cont('lista_espera')], ['Sem vaga', cont('sem_vaga')], ['Cancelados', cont('cancelada')]] as const).map(([r, v]) => (
          <div key={r} className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="text-xs text-stone-500">{r}</div>
            <div className="text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <Cartao
        titulo="Inscrições"
        acoes={
          <>
            <Selecao className="w-44" value={filtro} onChange={(ev) => setFiltro(ev.target.value as StatusInscricao | '')}>
              <option value="">Todas ({inscritos.length})</option>
              {Object.entries(ROTULO_INSCRICAO).map(([k, v]) => <option key={k} value={k}>{v} ({cont(k as StatusInscricao)})</option>)}
            </Selecao>
            <Botao variante="secundario" onClick={exportar}>Exportar CSV</Botao>
          </>
        }
      >
        {lista.length === 0 ? (
          <Vazio>Nenhuma inscrição {filtro && 'com esse status'}.</Vazio>
        ) : (
          <RolagemTabela>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th><th>RA</th><th>Curso</th><th>Celular</th><th>Situação</th>
                  {chaves.map((k) => <th key={k} className="max-w-48 truncate" title={rotuloResposta(e.perguntas, k)}>{rotuloResposta(e.perguntas, k)}</th>)}
                  <th>Inscrito em</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link to={`/admin/participantes/${i.participante_id}`} className="font-medium hover:underline">{i.participantes.nome}</Link>
                      <div className="text-xs text-stone-500">{i.participantes.email}</div>
                    </td>
                    <td>{i.participantes.ra ?? <span className="text-stone-400">externo</span>}</td>
                    <td className="whitespace-nowrap">{i.participantes.cursos?.nome ?? '—'}</td>
                    <td className="whitespace-nowrap">{i.participantes.celular ?? '—'}</td>
                    <td>
                      <Selecao className="w-36 py-1" value={i.status} onChange={(ev) => mudarInscricao(i.id, ev.target.value as StatusInscricao)} aria-label="Situação">
                        {Object.entries(ROTULO_INSCRICAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Selecao>
                    </td>
                    {chaves.map((k) => <td key={k} className="max-w-48">{i.respostas?.[k] ?? ''}</td>)}
                    <td className="whitespace-nowrap text-xs text-stone-500">
                      {fmtDataHora(i.criado_em)}
                      {i.origem !== 'plataforma' && <div>via {i.origem.replace('_', ' ')}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RolagemTabela>
        )}
      </Cartao>

      <Cartao className="mt-6" titulo="Incluir participante manualmente">
        <p className="mb-3 text-sm text-stone-500">Para quem se inscreveu fora do site. Entra como “Inscrito”; marque a presença na lista do dia.</p>
        <BuscaParticipante
          excluir={new Set(inscritos.map((i) => i.participante_id))}
          aoEscolher={(p) => acao(() => supabase.from('inscricoes').insert({ participante_id: p.id, evento_id: e.id, status: 'inscrito', origem: 'manual' }))}
        />
      </Cartao>
    </>
  )
}
