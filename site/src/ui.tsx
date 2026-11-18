import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import type { Tom } from './lib/formato'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma'
export function Botao({
  variante = 'primario', carregando, className, children, disabled, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean }) {
  const estilos: Record<Variante, string> = {
    primario: 'bg-marca-600 text-white hover:bg-marca-700',
    secundario: 'bg-white text-stone-800 border border-stone-300 hover:bg-stone-100',
    perigo: 'bg-red-600 text-white hover:bg-red-700',
    fantasma: 'text-stone-700 hover:bg-stone-200/60',
  }
  return (
    <button
      {...p}
      disabled={disabled || carregando}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
        'disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600',
        estilos[variante], className,
      )}
    >
      {carregando && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-stone-500">{dica}</span>}
    </label>
  )
}

const baseInput =
  'block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-marca-600 focus:outline-none focus:ring-2 focus:ring-marca-600/20 disabled:bg-stone-100'
export const Entrada = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cx(baseInput, className)} />
)
export const Selecao = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(baseInput, className)} />
)
export const AreaTexto = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(baseInput, className)} />
)

export function Cartao({ titulo, acoes, children, className }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-stone-200 bg-white shadow-xs', className)}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
          {titulo && <h2 className="font-semibold">{titulo}</h2>}
          {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

const TONS: Record<Tom, string> = {
  verde: 'bg-green-100 text-green-800',
  amarelo: 'bg-amber-100 text-amber-800',
  vermelho: 'bg-red-100 text-red-800',
  azul: 'bg-sky-100 text-sky-800',
  cinza: 'bg-stone-200 text-stone-700',
}
export const Selo = ({ tom, children }: { tom: Tom; children: ReactNode }) => (
  <span className={cx('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONS[tom])}>{children}</span>
)

export const Carregando = ({ texto = 'Carregando…' }: { texto?: string }) => (
  <div className="flex items-center gap-2 py-8 text-sm text-stone-500" role="status">
    <span className="size-4 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" /> {texto}
  </div>
)

export const Aviso = ({ tom = 'vermelho', children }: { tom?: 'vermelho' | 'verde' | 'amarelo'; children: ReactNode }) =>
  children ? (
    <div
      role={tom === 'vermelho' ? 'alert' : 'status'}
      className={cx(
        'rounded-lg px-3 py-2 text-sm',
        tom === 'vermelho' && 'bg-red-50 text-red-800',
        tom === 'verde' && 'bg-green-50 text-green-800',
        tom === 'amarelo' && 'bg-amber-50 text-amber-900',
      )}
    >
      {children}
    </div>
  ) : null

export const Vazio = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-stone-500">{children}</p>

export const Titulo = ({ children, sub, acoes }: { children: ReactNode; sub?: ReactNode; acoes?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-sm text-stone-500">{sub}</p>}
    </div>
    {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
  </div>
)

export function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: ReactNode; destaque?: boolean }) {
  return (
    <div className={cx('rounded-xl border p-4', destaque ? 'border-marca-600 bg-marca-50' : 'border-stone-200 bg-white')}>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{rotulo}</div>
      <div className={cx('mt-1 text-2xl font-bold', destaque && 'text-marca-700')}>{valor}</div>
    </div>
  )
}

export const RolagemTabela = ({ children }: { children: ReactNode }) => (
  <div className="-mx-4 overflow-x-auto px-4">{children}</div>
)
