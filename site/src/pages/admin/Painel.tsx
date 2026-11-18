import { Link } from 'react-router'
import { carregarEventos } from '../../lib/admin'
import { fmtDataHora, fmtHoras, ROTULO_EVENTO, TOM_EVENTO } from '../../lib/formato'
import { supabase } from '../../lib/supabase'
import { useDados } from '../../lib/useDados'
import { Aviso, Cartao, Carregando, Numero, Selo, Titulo, Vazio } from '../../ui'

export default function Painel() {
  const d = useDados(async () => {
    const [eventos, part, pend] = await Promise.all([
      carregarEventos(),
      supabase.from('participantes').select('id', { count: 'exact', head: true }),
      supabase.from('solicitacoes_validacao').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    ])
    if (part.error) throw part.error
    if (pend.error) throw pend.error
    return { eventos, nPart: part.count ?? 0, nPend: pend.count ?? 0 }
  }, [])

  if (d.carregando && !d.dados) return <Carregando />
  if (d.erro) return <Aviso>{d.erro}</Aviso>
  const { eventos, nPart, nPend } = d.dados!
  const agora = Date.now()
  const ativos = eventos
    .filter((e) => ['planejado', 'inscricoes_abertas', 'inscricoes_encerradas'].includes(e.status) || new Date(e.inicio).getTime() > agora)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  const presencasPendentes = eventos.filter(
    (e) => new Date(e.inicio).getTime() < agora && e.status !== 'cancelado' && e.status !== 'realizado',
  )

  return (
    <>
      <Titulo sub="Visão geral da organização">Painel</Titulo>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Participantes" valor={nPart} />
        <Numero rotulo="Eventos" valor={eventos.length} />
        <Numero rotulo="Inscrições abertas" valor={eventos.filter((e) => e.status === 'inscricoes_abertas').length} />
        <Link to="/admin/solicitacoes"><Numero rotulo="Validações pendentes" valor={nPend} destaque={nPend > 0} /></Link>
      </div>

      {presencasPendentes.length > 0 && (
        <div className="mt-6">
          <Aviso tom="amarelo">
            {presencasPendentes.length} evento(s) já aconteceram mas ainda não foram marcados como realizados:{' '}
            {presencasPendentes.map((e, i) => (
              <span key={e.id}>{i > 0 && ', '}<Link className="font-medium underline" to={`/admin/eventos/${e.id}/presenca`}>{e.titulo}</Link></span>
            ))}
            . Confirme a lista de presença.
          </Aviso>
        </div>
      )}

      <Cartao className="mt-6" titulo="Próximos eventos e rascunhos" acoes={<Link to="/admin/eventos/novo" className="text-sm font-medium text-marca-700 hover:underline">+ Novo evento</Link>}>
        {ativos.length === 0 ? (
          <Vazio>Nenhum evento futuro. Crie o próximo!</Vazio>
        ) : (
          <ul className="divide-y divide-stone-100">
            {ativos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link to={`/admin/eventos/${e.id}`} className="font-medium hover:underline">{e.titulo}</Link>
                  <div className="text-xs text-stone-500">{fmtDataHora(e.inicio)} · {fmtHoras(e.horas)}</div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-stone-600">
                    {e.resumo?.inscritos ?? 0}{e.vagas ? `/${e.vagas}` : ''} inscritos
                    {e.resumo?.lista_espera ? ` · ${e.resumo.lista_espera} na espera` : ''}
                  </span>
                  <Selo tom={TOM_EVENTO[e.status]}>{ROTULO_EVENTO[e.status]}</Selo>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  )
}
