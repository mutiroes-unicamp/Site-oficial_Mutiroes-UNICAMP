import type { Pergunta } from '../lib/tipos'
import { Campo, Entrada, Selecao } from '../ui'

/** Renderiza o formulário de inscrição configurado no evento. */
export function CamposPerguntas({
  perguntas, respostas, set,
}: {
  perguntas: Pergunta[]
  respostas: Record<string, string>
  set: (r: Record<string, string>) => void
}) {
  return (
    <div className="space-y-3">
      {perguntas.map((p) => {
        const v = respostas[p.id] ?? ''
        const mudar = (valor: string) => set({ ...respostas, [p.id]: valor })
        const rotulo = p.rotulo + (p.obrigatoria ? ' *' : '')
        return (
          <Campo key={p.id} rotulo={rotulo}>
            {p.tipo === 'sim_nao' ? (
              <Selecao required={p.obrigatoria} value={v} onChange={(e) => mudar(e.target.value)}>
                <option value="">—</option>
                <option>Sim</option>
                <option>Não</option>
              </Selecao>
            ) : p.tipo === 'opcao' ? (
              <Selecao required={p.obrigatoria} value={v} onChange={(e) => mudar(e.target.value)}>
                <option value="">—</option>
                {(p.opcoes ?? []).map((o) => <option key={o}>{o}</option>)}
              </Selecao>
            ) : (
              <Entrada
                type={p.tipo === 'numero' ? 'number' : 'text'}
                required={p.obrigatoria}
                value={v}
                onChange={(e) => mudar(e.target.value)}
              />
            )}
          </Campo>
        )
      })}
    </div>
  )
}

/** Rótulo legível de uma chave de resposta (perguntas atuais ou chaves antigas dos Forms). */
export function rotuloResposta(perguntas: Pergunta[], chave: string) {
  return perguntas.find((p) => p.id === chave)?.rotulo ?? chave
}
