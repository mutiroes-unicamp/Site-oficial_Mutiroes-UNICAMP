import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { carregarParticipantes } from '../../lib/admin'
import { baixarCsv } from '../../lib/csv'
import { fmtData, fmtHoras, normalizar } from '../../lib/formato'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Cartao, Carregando, Entrada, RolagemTabela, Selecao, Titulo, Vazio } from '../../ui'

type Ordem = 'nome' | 'acumuladas' | 'disponiveis'

export default function Participantes() {
  const d = useDados(carregarParticipantes, [])
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nome')

  const lista = useMemo(() => {
    const b = normalizar(busca)
    const l = (d.dados ?? []).filter(
      (p) => (!tipo || p.tipo === tipo) && (!b || normalizar(`${p.nome} ${p.ra} ${p.email} ${p.curso}`).includes(b)),
    )
    if (ordem === 'acumuladas') l.sort((a, b) => Number(b.saldo?.horas_acumuladas ?? 0) - Number(a.saldo?.horas_acumuladas ?? 0))
    if (ordem === 'disponiveis') l.sort((a, b) => Number(b.saldo?.horas_disponiveis ?? 0) - Number(a.saldo?.horas_disponiveis ?? 0))
    return l
  }, [d.dados, busca, tipo, ordem])

  if (d.carregando && !d.dados) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>

  function exportar() {
    baixarCsv(
      'participantes-mutiroes',
      ['Nome', 'E-mail', 'RA', 'Vínculo', 'Curso', 'Ano de ingresso', 'Celular', 'Idade', 'Gênero', 'Na comunidade', 'Horas acumuladas',
        'Horas validadas', 'Horas pendentes', 'Horas disponíveis', 'Cadastrado em', 'Observações'],
      lista.map((p) => [
        p.nome, p.email, p.ra, p.tipo === 'externo' ? 'Externo' : 'Aluno Unicamp', p.curso, p.ano_ingresso, p.celular, p.idade, p.genero,
        p.na_comunidade, p.saldo?.horas_acumuladas, p.saldo?.horas_validadas, p.saldo?.horas_pendentes, p.saldo?.horas_disponiveis,
        fmtData(p.criado_em), p.observacoes,
      ]),
    )
  }

  return (
    <>
      <Titulo sub={`${d.dados!.length} cadastros · ${d.dados!.filter((p) => p.tipo === 'aluno_unicamp').length} alunos Unicamp`}
        acoes={<Botao variante="secundario" onClick={exportar}>Exportar CSV</Botao>}>
        Participantes
      </Titulo>
      <Cartao>
        <div className="mb-4 flex flex-wrap gap-3">
          <Entrada className="max-w-xs" placeholder="Buscar nome, RA, e-mail, curso…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Selecao className="max-w-[12rem]" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos os vínculos</option>
            <option value="aluno_unicamp">Alunos Unicamp</option>
            <option value="externo">Externos</option>
          </Selecao>
          <Selecao className="max-w-[14rem]" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
            <option value="nome">Ordenar por nome</option>
            <option value="acumuladas">Mais horas acumuladas</option>
            <option value="disponiveis">Mais horas disponíveis</option>
          </Selecao>
        </div>
        {lista.length === 0 ? (
          <Vazio>Ninguém encontrado.</Vazio>
        ) : (
          <RolagemTabela>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th><th>RA</th><th>Curso</th>
                  <th className="text-right">Acumuladas</th><th className="text-right">Validadas</th>
                  <th className="text-right">Pendentes</th><th className="text-right">Disponíveis</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/admin/participantes/${p.id}`} className="font-medium text-marca-700 hover:underline">{p.nome}</Link>
                      <div className="text-xs text-stone-500">{p.email}</div>
                    </td>
                    <td>{p.ra ?? <span className="text-stone-400">externo</span>}</td>
                    <td className="whitespace-nowrap">{p.curso ?? '—'}</td>
                    <td className="text-right">{fmtHoras(p.saldo?.horas_acumuladas)}</td>
                    <td className="text-right">{fmtHoras(p.saldo?.horas_validadas)}</td>
                    <td className="text-right">{Number(p.saldo?.horas_pendentes) > 0 ? fmtHoras(p.saldo?.horas_pendentes) : '—'}</td>
                    <td className="text-right font-medium">{fmtHoras(p.saldo?.horas_disponiveis)}</td>
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
