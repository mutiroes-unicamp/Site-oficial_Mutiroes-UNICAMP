import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { limparRa, raSalvo, raValido, salvarRa } from '../../lib/acesso'
import { fmtDataHora, fmtHoras } from '../../lib/formato'
import { ok, supabase } from '../../lib/supabase'
import type { EventoPublico } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Campo, Cartao, Carregando, Entrada, Vazio } from '../../ui'

export default function Inicio() {
  const nav = useNavigate()
  const [ra, setRa] = useState(raSalvo())
  const [erro, setErro] = useState<string | null>(null)
  const eventos = useDados(async () => ok(await supabase.rpc('listar_eventos_abertos')) as EventoPublico[], [])

  function consultar(e: FormEvent) {
    e.preventDefault()
    if (!raValido(ra)) return setErro('Digite um RA com 5 ou 6 dígitos.')
    salvarRa(ra)
    nav('/consulta')
  }

  return (
    <>
      <section className="mb-8 grid gap-6 md:grid-cols-[1fr_22rem] md:items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mutirões UNICAMP</h1>
          <p className="mt-2 max-w-xl text-stone-600">
            Projeto de extensão com ações voluntárias de coleta, agrofloresta, adoção de animais e mais. Consulte suas horas de
            extensão, inscreva-se nos próximos mutirões e solicite a validação das suas horas.
          </p>
        </div>
        <Cartao titulo="Consultar minhas horas">
          <form onSubmit={consultar} className="space-y-3">
            <Campo rotulo="RA">
              <Entrada
                inputMode="numeric" autoComplete="off" placeholder="Ex.: 123456" value={ra}
                onChange={(e) => { setRa(limparRa(e.target.value)); setErro(null) }}
              />
            </Campo>
            <Aviso>{erro}</Aviso>
            <Botao type="submit" className="w-full">Consultar</Botao>
          </form>
        </Cartao>
      </section>

      <h2 className="mb-3 text-xl font-semibold">Próximos eventos</h2>
      {eventos.carregando && !eventos.dados ? (
        <Carregando />
      ) : eventos.erro ? (
        <Aviso>{eventos.erro}</Aviso>
      ) : !eventos.dados?.length ? (
        <Cartao><Vazio>Nenhum evento com inscrições no momento. Fique de olho na comunidade do WhatsApp!</Vazio></Cartao>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {eventos.dados.map((e) => {
            const abertas = e.status === 'inscricoes_abertas' && (!e.inscricoes_ate || new Date(e.inscricoes_ate).getTime() > Date.now())
            return (
              <Cartao key={e.id} titulo={e.titulo}>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-stone-500">Quando</dt><dd>{fmtDataHora(e.inicio)}</dd>
                  {e.local && (<><dt className="text-stone-500">Onde</dt><dd>{e.local}</dd></>)}
                  <dt className="text-stone-500">Horas</dt><dd>{fmtHoras(e.horas)}</dd>
                  {e.vagas !== null && (<><dt className="text-stone-500">Vagas</dt><dd>{e.vagas_restantes} de {e.vagas} restantes</dd></>)}
                </dl>
                {e.descricao && <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-stone-700">{e.descricao}</p>}
                <div className="mt-4">
                  {abertas ? (
                    <Link to={`/eventos/${e.id}`}>
                      <Botao>{e.vagas_restantes === 0 ? 'Entrar na lista de espera' : 'Quero participar'}</Botao>
                    </Link>
                  ) : (
                    <p className="text-sm text-stone-500">Inscrições encerradas.</p>
                  )}
                </div>
              </Cartao>
            )
          })}
        </div>
      )}
    </>
  )
}
