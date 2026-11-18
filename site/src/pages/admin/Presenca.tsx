import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { fmtDataHora, normalizar, ROTULO_INSCRICAO } from '../../lib/formato'
import { msgErro, supabase } from '../../lib/supabase'
import type { StatusInscricao } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Cartao, Carregando, Entrada, Titulo, Vazio } from '../../ui'
import { BuscaParticipante } from './BuscaParticipante'
import { carregarEventoComInscritos, type InscritoCompleto } from './inscritos'

const NA_LISTA: StatusInscricao[] = ['inscrito', 'presente', 'ausente', 'lista_espera']

/** Lista de presença do dia — feita para usar no celular, no local do evento. */
export default function Presenca() {
  const { id } = useParams()
  const d = useDados(() => carregarEventoComInscritos(id!), [id])
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<Set<number>>(new Set())

  const lista = useMemo(() => {
    const b = normalizar(busca)
    return (d.dados?.inscritos ?? []).filter(
      (i) => NA_LISTA.includes(i.status) && (!b || normalizar(`${i.participantes.nome} ${i.participantes.ra}`).includes(b)),
    )
  }, [d.dados, busca])

  if (d.carregando && !d.dados) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>
  const { evento, inscritos } = d.dados!
  const n = (s: StatusInscricao) => inscritos.filter((i) => i.status === s).length
  const semMarcar = inscritos.filter((i) => i.status === 'inscrito')

  // atualização otimista: a tela responde na hora, e desfaz se o banco recusar
  async function marcar(i: InscritoCompleto, status: StatusInscricao) {
    const antes = i.status
    setErro(null)
    d.setDados((x) => x && { ...x, inscritos: x.inscritos.map((y) => (y.id === i.id ? { ...y, status } : y)) })
    setSalvando((s) => new Set(s).add(i.id))
    const { error } = await supabase.from('inscricoes').update({ status }).eq('id', i.id)
    setSalvando((s) => { const t = new Set(s); t.delete(i.id); return t })
    if (error) {
      setErro(`${i.participantes.nome}: ${msgErro(error)}`)
      d.setDados((x) => x && { ...x, inscritos: x.inscritos.map((y) => (y.id === i.id ? { ...y, status: antes } : y)) })
    }
  }

  async function restantesAusentes() {
    if (!confirm(`Marcar ${semMarcar.length} inscrito(s) sem marcação como AUSENTES?`)) return
    const { error } = await supabase.from('inscricoes').update({ status: 'ausente' }).eq('evento_id', evento.id).eq('status', 'inscrito')
    if (error) setErro(msgErro(error))
    void d.recarregar()
  }

  async function concluir() {
    const { error } = await supabase.from('eventos').update({ status: 'realizado' }).eq('id', evento.id)
    if (error) setErro(msgErro(error))
    void d.recarregar()
  }

  async function adicionarPresente(pid: string) {
    setErro(null)
    const existente = inscritos.find((i) => i.participante_id === pid)
    const { error } = existente
      ? await supabase.from('inscricoes').update({ status: 'presente' }).eq('id', existente.id)
      : await supabase.from('inscricoes').insert({ participante_id: pid, evento_id: evento.id, status: 'presente', origem: 'manual' })
    if (error) setErro(msgErro(error))
    void d.recarregar()
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Titulo sub={<>{fmtDataHora(evento.inicio)} · <Link className="underline" to={`/admin/eventos/${evento.id}`}>detalhes do evento</Link></>}>
        Presença: {evento.titulo}
      </Titulo>

      <div className="sticky top-[57px] z-10 -mx-4 mb-4 border-b border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur">
        <div className="mb-2 flex justify-between text-sm">
          <span><strong className="text-green-700">{n('presente')}</strong> presentes</span>
          <span><strong className="text-red-700">{n('ausente')}</strong> ausentes</span>
          <span><strong>{semMarcar.length}</strong> sem marcar</span>
        </div>
        <Entrada type="search" placeholder="Buscar nome ou RA…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Aviso>{erro}</Aviso>

      {lista.length === 0 ? (
        <Cartao><Vazio>{busca ? 'Ninguém encontrado.' : 'Nenhum inscrito ainda.'}</Vazio></Cartao>
      ) : (
        <ul className="space-y-2">
          {lista.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{i.participantes.nome}</div>
                <div className="text-xs text-stone-500">
                  {i.participantes.ra ?? 'externo'}
                  {i.status === 'lista_espera' && ' · lista de espera'}
                  {salvando.has(i.id) && ' · salvando…'}
                </div>
              </div>
              <div className="flex shrink-0 gap-2" role="group" aria-label={`Presença de ${i.participantes.nome}`}>
                <button
                  onClick={() => marcar(i, i.status === 'presente' ? 'inscrito' : 'presente')}
                  aria-pressed={i.status === 'presente'}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${i.status === 'presente' ? 'bg-green-600 text-white' : 'border border-stone-300 text-stone-700'}`}
                >
                  Presente
                </button>
                <button
                  onClick={() => marcar(i, i.status === 'ausente' ? 'inscrito' : 'ausente')}
                  aria-pressed={i.status === 'ausente'}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${i.status === 'ausente' ? 'bg-red-600 text-white' : 'border border-stone-300 text-stone-700'}`}
                >
                  Faltou
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Cartao className="mt-6" titulo="Apareceu sem inscrição?">
        <BuscaParticipante
          rotuloAcao="Marcar presente"
          excluir={new Set(inscritos.filter((i) => i.status === 'presente').map((i) => i.participante_id))}
          aoEscolher={(p) => adicionarPresente(p.id)}
        />
        <p className="mt-2 text-xs text-stone-500">Se a pessoa não tiver cadastro, peça para ela entrar no site e se cadastrar, e então busque de novo.</p>
      </Cartao>

      <div className="mt-6 flex flex-wrap gap-2">
        {semMarcar.length > 0 && <Botao variante="secundario" onClick={restantesAusentes}>Marcar {semMarcar.length} restante(s) como ausentes</Botao>}
        {evento.status !== 'realizado' && <Botao onClick={concluir}>Concluir: marcar evento como realizado</Botao>}
      </div>
      <p className="mt-2 text-xs text-stone-500">
        As horas entram no saldo do aluno assim que a presença é marcada. Status: {ROTULO_INSCRICAO.presente} conta horas; os demais não.
      </p>
    </div>
  )
}
