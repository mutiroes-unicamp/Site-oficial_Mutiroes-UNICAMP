import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth'
import { msgErro, ok, supabase } from '../../lib/supabase'
import type { Papel } from '../../lib/tipos'
import { useDados } from '../../lib/useDados'
import { Aviso, Botao, Campo, Cartao, Carregando, Entrada, Selecao, Titulo, Vazio } from '../../ui'

interface Org { user_id: string; papel: Papel; criado_em: string }

/** Só admin. Organizadores são contas que já entraram no site ao menos uma vez. */
export default function Organizadores() {
  const { sessao } = useAuth()
  const d = useDados(async () => {
    const orgs = ok(await supabase.from('organizadores').select('*').order('criado_em')) as Org[]
    const ids = orgs.map((o) => o.user_id)
    const pessoas = ids.length
      ? (ok(await supabase.from('participantes').select('user_id, nome, email').in('user_id', ids)) as { user_id: string; nome: string; email: string }[])
      : []
    const porId = new Map(pessoas.map((p) => [p.user_id, p]))
    return orgs.map((o) => ({ ...o, pessoa: porId.get(o.user_id) ?? null }))
  }, [])
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('organizador')
  const [erro, setErro] = useState<string | null>(null)

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const p = ok(
      await supabase.from('participantes').select('user_id, nome').eq('email', email.trim().toLowerCase()).maybeSingle(),
    ) as { user_id: string | null; nome: string } | null
    if (!p) return setErro('Nenhum cadastro com esse e-mail. A pessoa precisa entrar no site e completar o cadastro primeiro.')
    if (!p.user_id) return setErro(`${p.nome} tem cadastro, mas ainda não entrou no site. Peça para entrar uma vez e tente de novo.`)
    const { error } = await supabase.from('organizadores').upsert({ user_id: p.user_id, papel })
    if (error) return setErro(msgErro(error))
    setEmail('')
    void d.recarregar()
  }

  async function mudar(uid: string, novo: Papel | null) {
    setErro(null)
    if (uid === sessao?.user.id && !confirm('Você está alterando o seu próprio acesso. Continuar?')) return
    const { error } = novo
      ? await supabase.from('organizadores').update({ papel: novo }).eq('user_id', uid)
      : await supabase.from('organizadores').delete().eq('user_id', uid)
    if (error) setErro(msgErro(error))
    void d.recarregar()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Titulo sub="Quem pode criar eventos, marcar presença e validar horas. Admins também gerenciam a equipe.">Equipe da organização</Titulo>
      <Aviso>{erro ?? d.erro}</Aviso>
      <Cartao className="mt-4" titulo="Membros">
        {d.carregando && !d.dados ? <Carregando /> : !d.dados?.length ? <Vazio>Ninguém.</Vazio> : (
          <ul className="divide-y divide-stone-100">
            {d.dados.map((o) => (
              <li key={o.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium">{o.pessoa?.nome ?? '(sem cadastro de participante)'}</div>
                  <div className="text-xs text-stone-500">{o.pessoa?.email ?? o.user_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Selecao className="w-36 py-1" value={o.papel} onChange={(e) => mudar(o.user_id, e.target.value as Papel)} aria-label="Papel">
                    <option value="organizador">Organizador</option>
                    <option value="admin">Admin</option>
                  </Selecao>
                  <Botao variante="fantasma" onClick={() => confirm('Remover acesso de organização?') && mudar(o.user_id, null)}>Remover</Botao>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <Cartao className="mt-6" titulo="Adicionar membro">
        <form onSubmit={adicionar} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <Campo rotulo="E-mail do cadastro"><Entrada type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
          <Campo rotulo="Papel">
            <Selecao value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              <option value="organizador">Organizador</option>
              <option value="admin">Admin</option>
            </Selecao>
          </Campo>
          <Botao type="submit">Adicionar</Botao>
        </form>
      </Cartao>
    </div>
  )
}
