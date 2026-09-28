import { createContext, useCallback, useContext, useId, useState, forwardRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as SwitchPrim from '@radix-ui/react-switch'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react'

export const cx = (...c) => c.filter(Boolean).join(' ')

/* ---------- Button ---------- */
const VARIANTES = {
  primary: 'bg-brand text-surface hover:bg-brand-dark active:bg-brand-dark',
  secondary: 'bg-surface text-ink border border-line hover:border-brand hover:text-brand active:bg-brand-soft',
  ghost: 'text-muted hover:text-ink hover:bg-line/40 active:bg-line/60',
  danger: 'bg-surface text-danger border border-danger/40 hover:bg-danger-soft active:bg-danger-soft',
}
const TAMANHOS = { sm: 'h-8 px-3 text-sm gap-2', md: 'h-12 px-4 text-base gap-2', lg: 'h-12 px-6 text-base gap-2' }

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, icon: Icon, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-md font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variant], TAMANHOS[size], className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  )
})

/* ---------- Campos ---------- */
export function Field({ label, error, hint, children, className, required }) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-muted">
          {label}{required && <span className="text-danger"> *</span>}
        </label>
      )}
      {typeof children === 'function' ? children({ id, invalid: !!error }) : children}
      {error ? (
        <p className="text-xs text-danger" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

const baseInput =
  'h-12 w-full rounded-md border bg-surface px-3 text-base text-ink placeholder:text-muted/70 transition-colors ' +
  'hover:border-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 ' +
  'disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted'

export const Input = forwardRef(function Input({ invalid, className, ...props }, ref) {
  return <input ref={ref} className={cx(baseInput, invalid ? 'border-danger' : 'border-line', className)} aria-invalid={invalid || undefined} {...props} />
})

export const Select = forwardRef(function Select({ invalid, className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx(baseInput, 'pr-8', invalid ? 'border-danger' : 'border-line', className)} aria-invalid={invalid || undefined} {...props}>
      {children}
    </select>
  )
})

export function Textarea({ className, ...props }) {
  return <textarea className={cx(baseInput, 'h-auto min-h-[96px] py-3 border-line', className)} {...props} />
}

export function Switch({ checked, onCheckedChange, label, disabled }) {
  const id = useId()
  return (
    <div className="flex items-center gap-3">
      <SwitchPrim.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-brand disabled:opacity-50"
      >
        <SwitchPrim.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </SwitchPrim.Root>
      <label htmlFor={id} className="text-sm text-ink">{label}</label>
    </div>
  )
}

/* Grupo de escolha rápida (chips) — usado nos filtros de lente e formas de pagamento */
export function Chips({ options, value, onChange, label, disabledValues = [] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const v = typeof o === 'object' ? o.value : o
        const l = typeof o === 'object' ? o.label : o
        const ativo = value === v
        const desab = disabledValues.includes(v)
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={desab}
            onClick={() => onChange(ativo ? null : v)}
            className={cx(
              'h-10 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              ativo ? 'border-brand bg-brand text-surface' : 'border-line bg-surface text-ink hover:border-brand hover:text-brand'
            )}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Estados ---------- */
export function Spinner({ label = 'Carregando' }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}…
    </div>
  )
}

export function Empty({ title, children, action }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line px-6 py-8">
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="max-w-prose text-sm text-muted">{children}</p>}
      {action}
    </div>
  )
}

export function Alert({ tone = 'danger', children }) {
  const tones = { danger: 'bg-danger-soft text-danger', warn: 'bg-warn-soft text-warn', ok: 'bg-ok-soft text-ok' }
  return (
    <div role="alert" className={cx('flex items-start gap-2 rounded-md px-4 py-3 text-sm', tones[tone])}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}

/* ---------- Modal ---------- */
export function Modal({ open, onOpenChange, title, children, wide }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content
          className={cx(
            'fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-lg bg-surface p-6 shadow-xl',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg',
            wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
          )}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-muted hover:text-ink" aria-label="Fechar">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [itens, setItens] = useState([])
  const toast = useCallback((texto, tone = 'ok') => {
    const id = Math.random()
    setItens((t) => [...t, { id, texto, tone }])
    setTimeout(() => setItens((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-32px)] max-w-sm flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {itens.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cx(
                'pointer-events-auto flex items-start gap-2 rounded-md px-4 py-3 text-sm font-medium shadow-lg',
                t.tone === 'ok' ? 'bg-ink text-surface' : 'bg-danger text-surface'
              )}
            >
              {t.tone === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              {t.texto}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- Seção de página ---------- */
export function Section({ title, aside, children, className }) {
  return (
    <section className={cx('rounded-lg border border-line bg-surface p-4 sm:p-6', className)}>
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}
