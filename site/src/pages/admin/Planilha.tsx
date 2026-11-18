import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { carregarEventos, carregarParticipantes, carregarTodasInscricoes } from '../../lib/admin'
import { baixarCsv } from '../../lib/csv'
import { fmtData, fmtHoras, normalizar, ROTULO_INSCRICAO } from '../../lib/formato'
import type { StatusInscricao } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Cartao, Carregando, Entrada, Titulo } from '../../ui'

const SIGLA: Record<StatusInscricao, { t: string; c: string }> = {
  presente: { t: 'P', c: 'bg-green-100 text-green-800' },
  ausente: { t: 'F', c: 'bg-red-100 text-red-800' },
  sem_vaga: { t: 'SV', c: 'bg-stone-200 text-stone-600' },
  inscrito: { t: 'I', c: 'bg-sky-100 text-sky-800' },
  lista_espera: { t: 'E', c: 'bg-amber-100 text-amber-800' },
  cancelada: { t: 'C', c: 'text-stone-400' },
}

// Texto igual ao da planilha original, para quem exportar e comparar
const TEXTO_LEGADO: Partial<Record<StatusInscricao, string>> = {
  presente: 'Participou', ausente: 'Não Participou', sem_vaga: 'Não conseguiu vaga',
}

/** Visão "planilha": participantes × eventos, como o antigo Controle de Horas. */
export default function Planilha() {
  const d = useDados(async () => {
    const [eventos, participantes, inscricoes] = await Promise.all([carregarEventos(), carregarParticipantes(), carregarTodasInscricoes()])
    eventos.sort((a, b) => a.inicio.localeCompare(b.inicio))
    const mapa = new Map<string, StatusInscricao>()
    inscricoes.forEach((i) => mapa.set(`${i.participante_id}:${i.evento_id}`, i.status))
    return { eventos, participantes, mapa }
  }, [])
  const [busca, setBusca] = useState('')
  const [deData, setDeData] = useState('')

  const { linhas, colunas } = useMemo(() => {
    if (!d.dados) return { linhas: [], colunas: [] }
    const b = normalizar(busca)
    const colunas = d.dados.eventos.filter((e) => !deData || e.inicio >= deData)
    const linhas = d.dados.participantes.filter((p) => !b || normalizar(`${p.nome} ${p.ra} ${p.email}`).includes(b))
    return { linhas, colunas }
  }, [d.dados, busca, deData])

  if (d.carregando && !d.dados) return <Carregando texto="Montando a planilha…" />
  if (d.erro) return <Aviso>{d.erro}</Aviso>
  const { mapa } = d.dados!

  function exportar(todasColunas: boolean) {
    const evs = todasColunas ? d.dados!.eventos : colunas
    baixarCsv(
      'controle-de-horas',
      ['Nome', 'RA', 'E-mail', 'Curso', 'Horas Acumuladas', 'Horas Solicitadas (pendentes)', 'Horas Validadas (TOTAL)', 'Horas Disponíveis',
        ...evs.map((e) => `${e.codigo_legado ?? e.titulo} (${fmtData(e.inicio)} · ${e.horas}h)`)],
      linhas.map((p) => [
        p.nome, p.ra, p.email, p.curso, p.saldo?.horas_acumuladas, p.saldo?.horas_pendentes, p.saldo?.horas_validadas, p.saldo?.horas_disponiveis,
        ...evs.map((e) => {
          const s = mapa.get(`${p.id}:${e.id}`)
          return s ? TEXTO_LEGADO[s] ?? ROTULO_INSCRICAO[s] : ''
        }),
      ]),
    )
  }

  return (
    <>
      <Titulo
        sub="Mesma visão do antigo “Controle de Horas”, calculada a partir do banco. Clique no nome para editar."
        acoes={
          <>
            <Botao variante="secundario" onClick={() => exportar(false)}>Exportar visão atual</Botao>
            <Botao variante="secundario" onClick={() => exportar(true)}>Exportar tudo</Botao>
          </>
        }
      >
        Planilha
      </Titulo>
      <Cartao>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Entrada className="max-w-xs" placeholder="Filtrar participante…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <label className="text-sm text-stone-600">
            Eventos a partir de{' '}
            <input type="date" className="rounded-md border border-stone-300 px-2 py-1" value={deData} onChange={(e) => setDeData(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(SIGLA).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1"><span className={`rounded px-1 font-semibold ${v.c}`}>{v.t}</span>{ROTULO_INSCRICAO[k as StatusInscricao]}</span>
            ))}
          </div>
        </div>
        <p className="mb-2 text-xs text-stone-500">{linhas.length} participantes × {colunas.length} eventos</p>
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-stone-200">
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-stone-100">
              <tr>
                <th className="sticky left-0 z-20 min-w-56 border-b border-r border-stone-200 bg-stone-100 px-2 py-2 text-left">Participante</th>
                <th className="border-b border-stone-200 px-2 text-right">Acum.</th>
                <th className="border-b border-stone-200 px-2 text-right">Valid.</th>
                <th className="border-b border-r border-stone-200 px-2 text-right">Disp.</th>
                {colunas.map((e) => (
                  <th key={e.id} className="h-36 border-b border-stone-200 align-bottom" title={`${e.titulo} — ${fmtData(e.inicio)} — ${e.horas}h`}>
                    <Link to={`/admin/eventos/${e.id}`} className="block w-6 rotate-180 whitespace-nowrap px-1 py-1 font-normal [writing-mode:vertical-rl] hover:underline">
                      {fmtData(e.inicio).slice(0, 5)} {e.titulo.slice(0, 22)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.id} className="hover:bg-stone-50">
                  <td className="sticky left-0 border-b border-r border-stone-100 bg-white px-2 py-1">
                    <Link to={`/admin/participantes/${p.id}`} className="hover:underline">{p.nome}</Link>
                    <span className="ml-1 text-stone-400">{p.ra}</span>
                  </td>
                  <td className="border-b border-stone-100 px-2 text-right">{fmtHoras(p.saldo?.horas_acumuladas).replace(' h', '')}</td>
                  <td className="border-b border-stone-100 px-2 text-right">{fmtHoras(p.saldo?.horas_validadas).replace(' h', '')}</td>
                  <td className="border-b border-r border-stone-100 px-2 text-right font-semibold">{fmtHoras(p.saldo?.horas_disponiveis).replace(' h', '')}</td>
                  {colunas.map((e) => {
                    const s = mapa.get(`${p.id}:${e.id}`)
                    return (
                      <td key={e.id} className="border-b border-stone-100 p-0 text-center">
                        {s && <span className={`block px-0.5 py-1 font-semibold ${SIGLA[s].c}`} title={ROTULO_INSCRICAO[s]}>{SIGLA[s].t}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </>
  )
}
