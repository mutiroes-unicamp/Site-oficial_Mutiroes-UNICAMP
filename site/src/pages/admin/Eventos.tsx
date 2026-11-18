import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { carregarEventos } from '../../lib/admin'
import { baixarCsv } from '../../lib/csv'
import { fmtData, fmtHoras, normalizar, ROTULO_EVENTO, TOM_EVENTO } from '../../lib/formato'
import type { StatusEvento } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Cartao, Carregando, Entrada, RolagemTabela, Selecao, Selo, Titulo, Vazio } from '../../ui'

export default function EventosAdmin() {
  const d = useDados(carregarEventos, [])
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<StatusEvento | ''>('')

  const lista = useMemo(() => {
    const b = normalizar(busca)
    return (d.dados ?? []).filter(
      (e) =>
        (!status || e.status === status) &&
        (!b || normalizar(`${e.titulo} ${e.local} ${e.edicao} ${e.codigo_legado} ${e.categoria}`).includes(b)),
    )
  }, [d.dados, busca, status])

  if (d.carregando && !d.dados) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>

  function exportar() {
    baixarCsv(
      'eventos-mutiroes',
      ['ID', 'Código legado', 'Edição', 'Título', 'Categoria', 'Local', 'Data', 'Horas', 'Vagas', 'Status', 'Inscritos', 'Presentes', 'Ausentes', 'Lista de espera', 'Sem vaga', 'Observações'],
      lista.map((e) => [
        e.id, e.codigo_legado, e.edicao, e.titulo, e.categoria, e.local, fmtData(e.inicio), e.horas, e.vagas, ROTULO_EVENTO[e.status],
        e.resumo?.inscritos, e.resumo?.presentes, e.resumo?.ausentes, e.resumo?.lista_espera, e.resumo?.sem_vaga, e.observacoes,
      ]),
    )
  }

  return (
    <>
      <Titulo
        sub={`${d.dados!.length} eventos`}
        acoes={
          <>
            <Botao variante="secundario" onClick={exportar}>Exportar CSV</Botao>
            <Link to="/admin/eventos/novo"><Botao>+ Novo evento</Botao></Link>
          </>
        }
      >
        Eventos
      </Titulo>
      <Cartao>
        <div className="mb-4 flex flex-wrap gap-3">
          <Entrada className="max-w-xs" placeholder="Buscar por nome, local, edição…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Selecao className="max-w-[14rem]" value={status} onChange={(e) => setStatus(e.target.value as StatusEvento | '')}>
            <option value="">Todos os status</option>
            {Object.entries(ROTULO_EVENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
        </div>
        {lista.length === 0 ? (
          <Vazio>Nenhum evento encontrado.</Vazio>
        ) : (
          <RolagemTabela>
            <table className="tabela">
              <thead>
                <tr><th>Data</th><th>Evento</th><th>Categoria</th><th className="text-right">Horas</th><th className="text-right">Inscritos</th><th className="text-right">Presentes</th><th>Status</th></tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{fmtData(e.inicio)}</td>
                    <td>
                      <Link to={`/admin/eventos/${e.id}`} className="font-medium text-marca-700 hover:underline">{e.titulo}</Link>
                      {(e.edicao || e.codigo_legado) && (
                        <div className="text-xs text-stone-500">{[e.edicao, e.codigo_legado].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{e.categoria ?? '—'}</td>
                    <td className="text-right">{fmtHoras(e.horas)}</td>
                    <td className="text-right">{e.resumo?.inscritos ?? 0}{e.vagas ? `/${e.vagas}` : ''}</td>
                    <td className="text-right">{e.resumo?.presentes ?? 0}</td>
                    <td><Selo tom={TOM_EVENTO[e.status]}>{ROTULO_EVENTO[e.status]}</Selo></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RolagemTabela>
        )}
      </Cartao>
    </>
  )
}
