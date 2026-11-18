import { useEffect, useState } from 'react'
import { normalizar } from '../../lib/formato'
import { ok, supabase } from '../../lib/supabase'
import type { Participante } from '../../lib/tipos'
import { Entrada } from '../../ui'

/** Busca participantes por nome, RA ou e-mail para incluir manualmente num evento. */
export function BuscaParticipante({
  excluir, aoEscolher, rotuloAcao = 'Adicionar',
}: {
  excluir: Set<string>
  aoEscolher: (p: Participante) => void
  rotuloAcao?: string
}) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Participante[]>([])

  useEffect(() => {
    const termo = q.trim()
    if (termo.length < 2) return setRes([])
    const t = setTimeout(async () => {
      const like = `"%${termo.replace(/[%_,()"\\]/g, ' ')}%"`
      const r = ok(
        await supabase.from('participantes').select('*').or(`nome.ilike.${like},ra.ilike.${like},email.ilike.${like}`).limit(15),
      ) as Participante[]
      // ilike não ignora acento: refiltra no cliente para melhorar a ordem
      const n = normalizar(termo)
      setRes(r.sort((a, b) => Number(normalizar(b.nome).startsWith(n)) - Number(normalizar(a.nome).startsWith(n))))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div>
      <Entrada placeholder="Buscar por nome, RA ou e-mail (mín. 2 letras)" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <ul className="mt-2 max-h-72 divide-y divide-stone-100 overflow-auto rounded-lg border border-stone-200">
          {res.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{p.nome}</div>
                <div className="text-xs text-stone-500">{[p.ra, p.email].filter(Boolean).join(' · ')}</div>
              </div>
              {excluir.has(p.id) ? (
                <span className="text-xs text-stone-400">já na lista</span>
              ) : (
                <button className="rounded-md bg-marca-600 px-2 py-1 text-xs font-medium text-white" onClick={() => { aoEscolher(p); setQ('') }}>
                  {rotuloAcao}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
