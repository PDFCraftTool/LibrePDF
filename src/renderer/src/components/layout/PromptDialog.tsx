import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, SlidersHorizontal } from 'lucide-react'
import { usePromptStore, type PromptField } from '../../stores/usePromptStore'
import { useTr } from '../../i18n'

const initialValues = (fields: PromptField[]) =>
  Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === 'number' ? 0 : f.options?.[0]?.value ?? '')]))

export const PromptDialog: React.FC = () => {
  const tr = useTr()
  const { request, close } = usePromptStore()
  const [values, setValues] = useState<Record<string, any>>({})
  const firstInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  useEffect(() => {
    if (request) {
      setValues(initialValues(request.fields))
      setTimeout(() => firstInputRef.current?.focus(), 30)
    }
  }, [request])

  useEffect(() => {
    if (!request) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 捕获阶段拦截，避免同时关闭下层弹窗
        e.preventDefault()
        e.stopPropagation()
        close(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [request, close])

  const errors = useMemo(() => {
    if (!request) return {}
    const result: Record<string, string> = {}
    for (const f of request.fields) {
      const v = values[f.name]
      if (f.required && (v === '' || v === undefined || v === null)) {
        result[f.name] = tr('此项为必填', 'This field is required')
        continue
      }
      if (f.type === 'number') {
        const n = Number(v)
        if (Number.isNaN(n)) result[f.name] = tr('请输入数字', 'Please enter a number')
        else if (f.min !== undefined && n < f.min) result[f.name] = tr(`不能小于 ${f.min}`, `Must be at least ${f.min}`)
        else if (f.max !== undefined && n > f.max) result[f.name] = tr(`不能大于 ${f.max}`, `Must be at most ${f.max}`)
      }
      const custom = f.validate?.(v, values)
      if (custom) result[f.name] = custom
    }
    return result
  }, [request, values, tr])

  if (!request) return null

  const hasErrors = Object.keys(errors).length > 0
  const submit = () => {
    if (hasErrors) return
    const out: Record<string, any> = {}
    for (const f of request.fields) out[f.name] = f.type === 'number' ? Number(values[f.name]) : values[f.name]
    close(out)
  }

  const setValue = (name: string, v: any) => setValues((prev) => ({ ...prev, [name]: v }))
  const isDanger = request.tone === 'danger'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-300">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 id="prompt-dialog-title" className="font-bold text-sm text-slate-100">{request.title}</h3>
              {request.description && <p className="text-[11px] text-slate-400 mt-0.5">{request.description}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => close(null)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={tr('关闭', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs max-h-[60vh] overflow-y-auto">
          {request.fields.map((f, idx) => {
            const id = `prompt-field-${f.name}`
            const error = errors[f.name]
            const refProp = idx === 0 ? { ref: firstInputRef as any } : {}
            return (
              <div key={f.name} className="space-y-1.5">
                <label htmlFor={id} className="block text-slate-300 font-medium">
                  {f.label}
                </label>

                {f.type === 'segmented' && f.options ? (
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(f.options.length, 4)}, minmax(0, 1fr))` }}>
                    {f.options.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setValue(f.name, opt.value)}
                        aria-pressed={values[f.name] === opt.value}
                        className={`px-2 py-2 rounded-lg border text-left transition-colors ${
                          values[f.name] === opt.value
                            ? 'bg-brand-500/10 border-brand-500/60 text-brand-100'
                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-semibold">{opt.label}</div>
                        {opt.hint && <div className="text-[10px] text-slate-400 mt-0.5">{opt.hint}</div>}
                      </button>
                    ))}
                  </div>
                ) : f.type === 'select' && f.options ? (
                  <select
                    id={id}
                    {...refProp}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValue(f.name, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    {f.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      id={id}
                      {...refProp}
                      type={f.type === 'number' ? 'number' : 'text'}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      placeholder={f.placeholder}
                      value={values[f.name] ?? ''}
                      onChange={(e) => setValue(f.name, e.target.value)}
                      className={`flex-1 bg-slate-950 border rounded-lg px-3 py-2 text-slate-200 focus:outline-none ${
                        error ? 'border-rose-500/70' : 'border-slate-700 focus:border-brand-500'
                      } ${f.type === 'number' ? 'font-mono' : ''}`}
                    />
                    {f.suffix && <span className="text-slate-400 shrink-0">{f.suffix}</span>}
                  </div>
                )}

                {error ? (
                  <p className="text-rose-300">{error}</p>
                ) : (
                  f.hint && <p className="text-slate-500">{f.hint}</p>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => close(null)}
            className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {request.cancelText || tr('取消', 'Cancel')}
          </button>
          <button
            type="submit"
            disabled={hasErrors}
            className={`px-5 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40 transition-colors shadow-lg ${
              isDanger ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20' : 'bg-brand-600 hover:bg-brand-500 shadow-brand-600/20'
            }`}
          >
            {request.confirmText || tr('确定', 'OK')}
          </button>
        </div>
      </form>
    </div>
  )
}
