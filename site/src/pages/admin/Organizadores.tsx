import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth'
import { CARGOS, cargoValida, limparRa, raValido } from '../../lib/acesso'
import { fmtData } from '../../lib/formato'
import { msgErro, ok, supabase } from '../../lib/supabase'
import type { Convite, Organizador, Papel } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Campo, Cartao, Carregando, Entrada, Selecao, Titulo, Vazio } from '../../ui'

/** Só admin. Novos membros entram por convite (RA) e definem a senha no "Primeiro acesso". */
export default function Organizadores() {
  const { organizador: eu } = useAuth()
  const euValido = cargoValida(eu?.cargo)
  const d = useDados(async () => {
    const [orgs, convs] = await Promise.all([
      supabase.from('organizadores').select('*').order('nome'),
      supabase.from('convites_admin').select('*').is('usado_em', null).order('criado_em', { ascending: false }),
    ])
    return { orgs: ok(orgs) as Organizador[], convites: ok(convs) as Convite[] }
  }, [])
  const [ra, setRa] = useState('')
  const [nome, setNome] = useState('')
  const [cargo, setCargo] = useState('')
  const [papel, setPapel] = useState<Papel>('organizador')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function executar(f: () => PromiseLike<{ error: unknown }>, sucesso?: string) {
    setErro(null)
    setAviso(null)
    const { error } = await f()
    if (error) setErro(msgErro(error))
    else if (sucesso) setAviso(sucesso)
    void d.recarregar()
  }

  async function convidar(e: FormEvent) {
    e.preventDefault()
    if (!raValido(ra)) return setErro('RA com 5 ou 6 dígitos.')
    if (d.dados?.orgs.some((o) => o.ra === limparRa(ra))) return setErro('Esse RA já faz parte da equipe.')
    await executar(
      () => supabase.from('convites_admin').upsert({
        ra: limparRa(ra), nome: nome.trim(), cargo: cargo.trim() || null, papel, usado_em: null,
        criado_em: new Date().toISOString(), expira_em: new Date(Date.now() + 7 * 864e5).toISOString(),
      }),
      `Convite criado. Avise ${nome.trim().split(' ')[0]}: entrar em “Acessar como administrador › Primeiro acesso” com o RA ${limparRa(ra)} em até 7 dias.`,
    )
    setRa('')
    setNome('')
    setCargo('')
  }

  if (d.carregando && !d.dados) return <Carregando />

  return (
    <div className="mx-auto max-w-3xl">
      <Titulo sub="Quem pode criar eventos, marcar presença e validar horas. Admins também gerenciam a equipe.">Equipe da organização</Titulo>
      <Aviso>{erro ?? d.erro}</Aviso>
      {aviso && <Aviso tom="verde">{aviso}</Aviso>}

      <Cartao className="mt-4" titulo="Membros">
        {!d.dados?.orgs.length ? <Vazio>Ninguém.</Vazio> : (
          <ul className="divide-y divide-stone-100">
            {d.dados.orgs.map((o) => (
              <li key={o.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium">{o.nome}{o.user_id === eu?.user_id && <span className="ml-1 text-xs text-stone-500">(você)</span>}</div>
                  <div className="text-xs text-stone-500">{o.cargo && <>{o.cargo} · </>}RA {o.ra} · desde {fmtData(o.criado_em)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SeletorCargo valor={o.cargo} podeValidacao={euValido}
                    aoMudar={(c) => executar(() => supabase.from('organizadores').update({ cargo: c }).eq('user_id', o.user_id))} />
                  <Selecao className="w-36 py-1" value={o.papel} aria-label="Papel"
                    onChange={(e) => executar(() => supabase.from('organizadores').update({ papel: e.target.value as Papel }).eq('user_id', o.user_id))}>
                    <option value="organizador">Organizador</option>
                    <option value="admin">Admin</option>
                  </Selecao>
                  <Botao variante="fantasma" className="px-2"
                    onClick={() => confirm(`Redefinir o acesso de ${o.nome}? A senha atual deixa de valer e a pessoa cria outra em “Primeiro acesso”.`) &&
                      executar(() => supabase.rpc('redefinir_acesso_admin', { p_user_id: o.user_id }),
                        `Acesso de ${o.nome} redefinido. Avise para entrar em “Primeiro acesso” com o RA ${o.ra} em até 7 dias.`)}>
                    Redefinir senha
                  </Botao>
                  <Botao variante="fantasma" className="px-2 text-red-700"
                    onClick={() => confirm(`Remover ${o.nome} da organização?`) &&
                      executar(() => supabase.rpc('remover_organizador', { p_user_id: o.user_id }))}>
                    Remover
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {!!d.dados?.convites.length && (
        <Cartao className="mt-6" titulo="Convites aguardando o primeiro acesso">
          <ul className="divide-y divide-stone-100 text-sm">
            {d.dados.convites.map((c) => {
              const expirado = new Date(c.expira_em).getTime() < Date.now()
              return (
                <li key={c.ra} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium">{c.nome} <span className="text-xs text-stone-500">({[c.cargo, c.papel].filter(Boolean).join(' · ')})</span></div>
                    <div className={`text-xs ${expirado ? 'text-red-700' : 'text-stone-500'}`}>
                      RA {c.ra} · {expirado ? 'expirado em' : 'vale até'} {fmtData(c.expira_em)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {expirado && (
                      <Botao variante="secundario" className="px-2 py-1"
                        onClick={() => executar(() => supabase.from('convites_admin').update({ expira_em: new Date(Date.now() + 7 * 864e5).toISOString() }).eq('ra', c.ra))}>
                        Renovar
                      </Botao>
                    )}
                    <Botao variante="fantasma" className="px-2 py-1" onClick={() => executar(() => supabase.from('convites_admin').delete().eq('ra', c.ra))}>
                      Cancelar convite
                    </Botao>
                  </div>
                </li>
              )
            })}
          </ul>
        </Cartao>
      )}

      <Cartao className="mt-6" titulo="Convidar membro">
        <form onSubmit={convidar} className="grid gap-3 sm:grid-cols-[8rem_1fr_9rem_9rem_auto] sm:items-end">
          <Campo rotulo="RA"><Entrada inputMode="numeric" required value={ra} onChange={(e) => setRa(limparRa(e.target.value))} /></Campo>
          <Campo rotulo="Nome"><Entrada required value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Campo rotulo="Cargo"><SeletorCargo valor={cargo} podeValidacao={euValido} aoMudar={(c) => setCargo(c ?? '')} /></Campo>
          <Campo rotulo="Papel">
            <Selecao value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              <option value="organizador">Organizador</option>
              <option value="admin">Admin</option>
            </Selecao>
          </Campo>
          <Botao type="submit">Convidar</Botao>
        </form>
        <p className="mt-2 text-xs text-stone-500">
          A pessoa define a própria senha; ninguém precisa repassar senha. Só Capitã(o) e Vice-capitã(o) veem a aba Validações
          {euValido ? '.' : ', e só eles podem atribuir esses cargos.'}
        </p>
      </Cartao>
    </div>
  )
}

/** Cargos: lista fixa (os de validação só aparecem para quem já valida, como no banco). */
function SeletorCargo({ valor, podeValidacao, aoMudar }: { valor: string | null; podeValidacao: boolean; aoMudar: (c: string | null) => void }) {
  const atualValida = cargoValida(valor)
  const bloqueado = atualValida && !podeValidacao
  return (
    <Selecao className="w-40 py-1" aria-label="Cargo" value={valor ?? ''} disabled={bloqueado}
      title={bloqueado ? 'Só Capitã(o) ou Vice-capitã(o) podem alterar este cargo' : undefined}
      onChange={(e) => aoMudar(e.target.value || null)}>
      <option value="">Sem cargo</option>
      {CARGOS.filter((c) => podeValidacao || c === valor).map((c) => <option key={c}>{c}</option>)}
      {valor && !CARGOS.includes(valor as (typeof CARGOS)[number]) && <option>{valor}</option>}
    </Selecao>
  )
}
