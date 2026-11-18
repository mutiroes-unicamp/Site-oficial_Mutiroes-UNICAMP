import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { carregarCategorias } from '../../lib/admin'
import { deInputLocal, normalizar, paraInputLocal, ROTULO_EVENTO } from '../../lib/formato'
import { msgErro, ok, supabase } from '../../lib/supabase'
import type { Evento, Pergunta, StatusEvento, TipoPergunta } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { AreaTexto, Aviso, Botao, Campo, Cartao, Carregando, Entrada, Selecao, Titulo } from '../../ui'

const MODELOS: Record<string, Pergunta[]> = {
  Carona: [
    { id: 'precisa_carona', rotulo: 'Você precisará de carona para ir ao evento?', tipo: 'sim_nao', obrigatoria: true },
    { id: 'oferece_carona', rotulo: 'Você pode oferecer carona no seu carro?', tipo: 'sim_nao', obrigatoria: true },
    { id: 'vagas_carona', rotulo: 'Se sim, quantas vagas?', tipo: 'numero' },
  ],
  'Créditos de extensão': [
    { id: 'validar_creditos', rotulo: 'Você deseja validar créditos de extensão com este evento?', tipo: 'sim_nao', obrigatoria: true },
  ],
}

const ROTULO_TIPO: Record<TipoPergunta, string> = { texto: 'Texto', sim_nao: 'Sim / Não', numero: 'Número', opcao: 'Lista de opções' }

function slug(s: string, usados: Set<string>) {
  const base = normalizar(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'pergunta'
  let id = base
  for (let i = 2; usados.has(id); i++) id = `${base}_${i}`
  return id
}

interface Form {
  titulo: string; descricao: string; categoria_id: string; local: string; inicio: string; horas: string
  vagas: string; inscricoes_ate: string; status: StatusEvento; edicao: string; observacoes: string; perguntas: Pergunta[]
}

const VAZIO: Form = {
  titulo: '', descricao: '', categoria_id: '', local: '', inicio: '', horas: '', vagas: '', inscricoes_ate: '',
  status: 'planejado', edicao: '', observacoes: '', perguntas: [],
}

export default function EventoForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const editando = Boolean(id)
  const cats = useDados(carregarCategorias, [])
  const ev = useDados(
    async () => (id ? (ok(await supabase.from('eventos').select('*').eq('id', id).single()) as Evento) : null),
    [id],
  )
  const [f, setF] = useState<Form>(VAZIO)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const e = ev.dados
    if (!e) return
    setF({
      titulo: e.titulo, descricao: e.descricao ?? '', categoria_id: e.categoria_id?.toString() ?? '', local: e.local ?? '',
      inicio: paraInputLocal(e.inicio), horas: String(e.horas), vagas: e.vagas?.toString() ?? '',
      inscricoes_ate: paraInputLocal(e.inscricoes_ate), status: e.status, edicao: e.edicao ?? '',
      observacoes: e.observacoes ?? '', perguntas: e.perguntas ?? [],
    })
  }, [ev.dados])

  if (cats.carregando || ev.carregando) return <Carregando />
  if (ev.erro) return <Aviso>{ev.erro}</Aviso>

  const up = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  function setPergunta(i: number, p: Partial<Pergunta>) {
    setF({ ...f, perguntas: f.perguntas.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  }
  function addPergunta(p?: Pergunta) {
    const usados = new Set(f.perguntas.map((x) => x.id))
    const nova = p ?? { id: '', rotulo: '', tipo: 'texto' as TipoPergunta, obrigatoria: false }
    setF((atual) => ({ ...atual, perguntas: [...atual.perguntas, { ...nova, id: nova.id && !usados.has(nova.id) ? nova.id : slug(nova.rotulo || 'pergunta', usados) }] }))
  }
  function mover(i: number, d: -1 | 1) {
    const ps = [...f.perguntas]
    const j = i + d
    if (j < 0 || j >= ps.length) return
    ;[ps[i], ps[j]] = [ps[j], ps[i]]
    setF({ ...f, perguntas: ps })
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const perguntas = f.perguntas
      .filter((p) => p.rotulo.trim())
      .map((p) => ({
        id: p.id, rotulo: p.rotulo.trim(), tipo: p.tipo, obrigatoria: !!p.obrigatoria,
        ...(p.tipo === 'opcao' ? { opcoes: (p.opcoes ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
      }))
    if (perguntas.some((p) => p.tipo === 'opcao' && !(p.opcoes ?? []).length)) {
      return setErro('Perguntas do tipo "lista de opções" precisam de ao menos uma opção.')
    }
    const linha = {
      titulo: f.titulo.trim(), descricao: f.descricao.trim() || null, categoria_id: f.categoria_id ? Number(f.categoria_id) : null,
      local: f.local.trim() || null, inicio: deInputLocal(f.inicio), horas: Number(f.horas.replace(',', '.')),
      vagas: f.vagas ? Number(f.vagas) : null, inscricoes_ate: deInputLocal(f.inscricoes_ate), status: f.status,
      edicao: f.edicao.trim() || null, observacoes: f.observacoes.trim() || null, perguntas,
    }
    setOcupado(true)
    const r = editando
      ? await supabase.from('eventos').update(linha).eq('id', id!).select('id').single()
      : await supabase.from('eventos').insert(linha).select('id').single()
    setOcupado(false)
    if (r.error) return setErro(msgErro(r.error))
    nav(`/admin/eventos/${(r.data as { id: number }).id}`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Titulo sub="Os alunos se inscrevem pelo site quando o status estiver em “Inscrições abertas”.">
        {editando ? 'Editar evento' : 'Novo evento'}
      </Titulo>
      <form onSubmit={salvar} className="space-y-6">
        <Cartao titulo="Informações">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Campo rotulo="Título *"><Entrada required value={f.titulo} onChange={up('titulo')} placeholder="Ex.: Agrofloresta 16" /></Campo></div>
            <Campo rotulo="Categoria">
              <Selecao value={f.categoria_id} onChange={up('categoria_id')}>
                <option value="">—</option>
                {(cats.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Edição" dica="Ex.: 69ª Edição (informativo)"><Entrada value={f.edicao} onChange={up('edicao')} /></Campo>
            <div className="sm:col-span-2"><Campo rotulo="Local"><Entrada value={f.local} onChange={up('local')} /></Campo></div>
            <Campo rotulo="Início *"><Entrada type="datetime-local" required value={f.inicio} onChange={up('inicio')} /></Campo>
            <Campo rotulo="Horas de extensão *"><Entrada type="number" required min={0.5} step={0.5} value={f.horas} onChange={up('horas')} /></Campo>
            <Campo rotulo="Vagas" dica="Vazio = sem limite. Excedentes vão para a lista de espera."><Entrada type="number" min={1} value={f.vagas} onChange={up('vagas')} /></Campo>
            <Campo rotulo="Inscrições até" dica="Opcional"><Entrada type="datetime-local" value={f.inscricoes_ate} onChange={up('inscricoes_ate')} /></Campo>
            <Campo rotulo="Status">
              <Selecao value={f.status} onChange={up('status')}>
                {Object.entries(ROTULO_EVENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Selecao>
            </Campo>
            <div className="sm:col-span-2"><Campo rotulo="Descrição (aparece para os alunos)"><AreaTexto rows={4} value={f.descricao} onChange={up('descricao')} placeholder="O que levar, ponto de encontro, recomendações…" /></Campo></div>
            <div className="sm:col-span-2"><Campo rotulo="Observações internas (só a organização vê)"><AreaTexto rows={2} value={f.observacoes} onChange={up('observacoes')} /></Campo></div>
          </div>
        </Cartao>

        <Cartao
          titulo="Formulário de inscrição"
          acoes={Object.keys(MODELOS).map((m) => (
            <Botao key={m} type="button" variante="secundario" onClick={() => MODELOS[m].forEach((p) => addPergunta(p))}>+ {m}</Botao>
          ))}
        >
          <p className="mb-4 text-sm text-stone-500">
            Nome, e-mail, RA e curso já vêm do cadastro do aluno. Adicione aqui só as perguntas específicas deste evento.
          </p>
          <div className="space-y-3">
            {f.perguntas.map((p, i) => (
              <div key={p.id + i} className="rounded-lg border border-stone-200 p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                  <Entrada placeholder="Pergunta" value={p.rotulo} onChange={(e) => setPergunta(i, { rotulo: e.target.value })} />
                  <Selecao value={p.tipo} onChange={(e) => setPergunta(i, { tipo: e.target.value as TipoPergunta })}>
                    {Object.entries(ROTULO_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Selecao>
                </div>
                {p.tipo === 'opcao' && (
                  <Entrada
                    className="mt-2" placeholder="Opções separadas por vírgula"
                    value={(p.opcoes ?? []).join(', ')}
                    onChange={(e) => setPergunta(i, { opcoes: e.target.value.split(',') })}
                  />
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={!!p.obrigatoria} onChange={(e) => setPergunta(i, { obrigatoria: e.target.checked })} />
                    Obrigatória
                  </label>
                  <div className="flex gap-1">
                    <Botao type="button" variante="fantasma" onClick={() => mover(i, -1)} aria-label="Subir">↑</Botao>
                    <Botao type="button" variante="fantasma" onClick={() => mover(i, 1)} aria-label="Descer">↓</Botao>
                    <Botao type="button" variante="fantasma" onClick={() => setF({ ...f, perguntas: f.perguntas.filter((_, j) => j !== i) })}>Remover</Botao>
                  </div>
                </div>
              </div>
            ))}
            <Botao type="button" variante="secundario" onClick={() => addPergunta()}>+ Pergunta</Botao>
          </div>
        </Cartao>

        <Aviso>{erro}</Aviso>
        <div className="flex gap-2">
          <Botao type="submit" carregando={ocupado}>{editando ? 'Salvar alterações' : 'Criar evento'}</Botao>
          <Botao type="button" variante="fantasma" onClick={() => nav(-1)}>Cancelar</Botao>
        </div>
      </form>
    </div>
  )
}
