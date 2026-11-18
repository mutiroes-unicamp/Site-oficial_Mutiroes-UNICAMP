import { useState } from 'react'
import { Link } from 'react-router'
import { baixarCsv } from '../../lib/csv'
import { fmtDataHora, fmtHoras, ROTULO_SOLICITACAO, TOM_SOLICITACAO } from '../../lib/formato'
import { msgErro, supabase, todos } from '../../lib/supabase'
import type { Saldo, Solicitacao, StatusSolicitacao } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Cartao, Carregando, RolagemTabela, Selecao, Selo, Titulo, Vazio } from '../../ui'

type SolP = Solicitacao & { participantes: { nome: string; ra: string | null; email: string } }

export default function Solicitacoes() {
  const [status, setStatus] = useState<StatusSolicitacao | ''>('pendente')
  const d = useDados(async () => {
    const sols = await todos<SolP>((de, ate) => {
      let q = supabase.from('solicitacoes_validacao').select('*, participantes(nome, ra, email)')
        .order('solicitado_em', { ascending: status === 'pendente' })
      if (status) q = q.eq('status', status)
      return q.range(de, ate)
    })
    const saldos = sols.length ? await todos<Saldo>((de, ate) => supabase.from('saldo_horas').select('*').range(de, ate)) : []
    return { sols, saldo: new Map(saldos.map((s) => [s.participante_id, s])) }
  }, [status])
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)

  async function decidir(s: SolP, novo: 'aprovada' | 'recusada') {
    let observacao = s.observacao
    if (novo === 'recusada') {
      const motivo = prompt('Motivo da recusa (o aluno verá esta mensagem):')
      if (motivo === null) return
      observacao = motivo.trim() || null
    } else if (!confirm(`Aprovar ${fmtHoras(s.horas)} para ${s.participantes.nome}?`)) return
    setErro(null)
    setOcupado(s.id)
    const { error } = await supabase.from('solicitacoes_validacao').update({ status: novo, observacao }).eq('id', s.id).eq('status', 'pendente')
    setOcupado(null)
    if (error) setErro(msgErro(error))
    void d.recarregar()
  }

  function exportar() {
    baixarCsv(
      `validacoes-${status || 'todas'}`,
      ['Nome', 'RA', 'E-mail', 'Horas', 'Status', 'Solicitado em', 'Decidido em', 'Observação'],
      (d.dados?.sols ?? []).map((s) => [
        s.participantes.nome, s.participantes.ra, s.participantes.email, s.horas, ROTULO_SOLICITACAO[s.status],
        fmtDataHora(s.solicitado_em), s.decidido_em ? fmtDataHora(s.decidido_em) : '', s.observacao,
      ]),
    )
  }

  return (
    <>
      <Titulo
        sub="Pedidos dos alunos para validar horas de extensão"
        acoes={
          <>
            <Selecao className="w-44" value={status} onChange={(e) => setStatus(e.target.value as StatusSolicitacao | '')}>
              <option value="pendente">Pendentes</option>
              <option value="aprovada">Aprovadas</option>
              <option value="recusada">Recusadas</option>
              <option value="">Todas</option>
            </Selecao>
            <Botao variante="secundario" onClick={exportar}>Exportar CSV</Botao>
          </>
        }
      >
        Validações de horas
      </Titulo>
      <Aviso>{erro ?? d.erro}</Aviso>
      <Cartao>
        {d.carregando && !d.dados ? <Carregando /> : !d.dados?.sols.length ? (
          <Vazio>Nenhuma solicitação {status && ROTULO_SOLICITACAO[status].toLowerCase()}.</Vazio>
        ) : (
          <RolagemTabela>
            <table className="tabela">
              <thead>
                <tr><th>Aluno</th><th className="text-right">Pedido</th><th className="text-right">Acumuladas</th><th className="text-right">Já validadas</th><th>Solicitado em</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {d.dados.sols.map((s) => {
                  const sal = d.dados!.saldo.get(s.participante_id)
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/admin/participantes/${s.participante_id}`} className="font-medium hover:underline">{s.participantes.nome}</Link>
                        <div className="text-xs text-stone-500">{s.participantes.ra ?? s.participantes.email}</div>
                      </td>
                      <td className="text-right font-semibold">{fmtHoras(s.horas)}</td>
                      <td className="text-right">{fmtHoras(sal?.horas_acumuladas)}</td>
                      <td className="text-right">{fmtHoras(sal?.horas_validadas)}</td>
                      <td className="whitespace-nowrap">{fmtDataHora(s.solicitado_em)}</td>
                      <td>
                        <Selo tom={TOM_SOLICITACAO[s.status]}>{ROTULO_SOLICITACAO[s.status]}</Selo>
                        {s.observacao && <div className="mt-1 max-w-56 text-xs text-stone-500">{s.observacao}</div>}
                      </td>
                      <td className="whitespace-nowrap">
                        {s.status === 'pendente' && (
                          <div className="flex gap-2">
                            <Botao carregando={ocupado === s.id} onClick={() => decidir(s, 'aprovada')}>Aprovar</Botao>
                            <Botao variante="secundario" disabled={ocupado === s.id} onClick={() => decidir(s, 'recusada')}>Recusar</Botao>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </RolagemTabela>
        )}
      </Cartao>
    </>
  )
}
