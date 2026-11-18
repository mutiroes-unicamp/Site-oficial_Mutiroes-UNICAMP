import type { Curso, TipoParticipante } from '../lib/tipos'
import { Campo, Entrada, Selecao } from '../ui'

export interface DadosCadastro {
  nome: string
  tipo: TipoParticipante
  ra: string
  curso_id: string
  ano_ingresso: string
  celular: string
  idade: string
  genero: string
  na_comunidade: string // '' | 'sim' | 'nao'
}

export const GENEROS = ['Feminino', 'Masculino', 'Não binário', 'Prefiro não informar']

export function paraLinha(d: DadosCadastro) {
  const n = (v: string) => (v.trim() === '' ? null : Number(v))
  return {
    nome: d.nome.trim().replace(/\s+/g, ' '),
    curso_id: n(d.curso_id),
    ano_ingresso: n(d.ano_ingresso),
    celular: d.celular.trim() || null,
    idade: n(d.idade),
    genero: d.genero || null,
    na_comunidade: d.na_comunidade === '' ? null : d.na_comunidade === 'sim',
  }
}

export function deParticipante(p: {
  nome: string; tipo: TipoParticipante; ra: string | null; curso_id: number | null; ano_ingresso: number | null
  celular: string | null; idade: number | null; genero: string | null; na_comunidade: boolean | null
}): DadosCadastro {
  return {
    nome: p.nome, tipo: p.tipo, ra: p.ra ?? '', curso_id: p.curso_id?.toString() ?? '',
    ano_ingresso: p.ano_ingresso?.toString() ?? '', celular: p.celular ?? '', idade: p.idade?.toString() ?? '',
    genero: p.genero ?? '', na_comunidade: p.na_comunidade === null ? '' : p.na_comunidade ? 'sim' : 'nao',
  }
}

/** Campos comuns ao autocadastro, à edição pelo aluno e à edição pela organização. */
export function CamposCadastro({
  d, set, cursos, podeEditarIdentidade,
}: {
  d: DadosCadastro
  set: (d: DadosCadastro) => void
  cursos: Curso[]
  podeEditarIdentidade: boolean
}) {
  const up = (k: keyof DadosCadastro) => (e: { target: { value: string } }) => set({ ...d, [k]: e.target.value })
  const ano = new Date().getFullYear()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Campo rotulo="Nome completo">
          <Entrada required value={d.nome} onChange={up('nome')} autoComplete="name" />
        </Campo>
      </div>
      <Campo rotulo="Vínculo">
        <Selecao value={d.tipo} onChange={up('tipo')} disabled={!podeEditarIdentidade}>
          <option value="aluno_unicamp">Aluno(a) da Unicamp</option>
          <option value="externo">Comunidade externa</option>
        </Selecao>
      </Campo>
      {d.tipo === 'aluno_unicamp' && (
        <Campo rotulo="RA" dica={podeEditarIdentidade ? undefined : 'Para corrigir o RA, fale com a organização.'}>
          <Entrada
            required inputMode="numeric" pattern="\d{5,6}" title="5 ou 6 dígitos" value={d.ra}
            onChange={up('ra')} disabled={!podeEditarIdentidade}
          />
        </Campo>
      )}
      {d.tipo === 'aluno_unicamp' && (
        <>
          <Campo rotulo="Curso">
            <Selecao value={d.curso_id} onChange={up('curso_id')}>
              <option value="">—</option>
              {cursos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Ano de ingresso">
            <Entrada type="number" min={1966} max={ano + 1} value={d.ano_ingresso} onChange={up('ano_ingresso')} />
          </Campo>
        </>
      )}
      <Campo rotulo="Celular (WhatsApp)">
        <Entrada type="tel" autoComplete="tel" value={d.celular} onChange={up('celular')} placeholder="(19) 99999-9999" />
      </Campo>
      <Campo rotulo="Idade">
        <Entrada type="number" min={10} max={120} value={d.idade} onChange={up('idade')} />
      </Campo>
      <Campo rotulo="Gênero">
        <Selecao value={d.genero} onChange={up('genero')}>
          <option value="">—</option>
          {GENEROS.map((g) => <option key={g}>{g}</option>)}
          {d.genero && !GENEROS.includes(d.genero) && <option>{d.genero}</option>}
        </Selecao>
      </Campo>
      <Campo rotulo="Está na comunidade do WhatsApp?">
        <Selecao value={d.na_comunidade} onChange={up('na_comunidade')}>
          <option value="">—</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </Selecao>
      </Campo>
    </div>
  )
}
