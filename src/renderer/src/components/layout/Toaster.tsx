import React from 'react'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X, FolderOpen } from 'lucide-react'
import { useToastStore, type ToastType } from '../../stores/useToastStore'
import { useTr } from '../../i18n'

const styles: Record<ToastType, { icon: React.ElementType; accent: string; ring: string }> = {
  success: { icon: CheckCircle2, accent: 'text-emerald-400', ring: 'border-emerald-500/30' },
  error: { icon: AlertCircle, accent: 'text-rose-400', ring: 'border-rose-500/40' },
  info: { icon: Info, accent: 'text-sky-400', ring: 'border-sky-500/30' },
  warning: { icon: AlertTriangle, accent: 'text-amber-400', ring: 'border-amber-500/30' }
}

/**
 * 全局轻提示：替代原先阻塞式的 alert()，统一操作结果反馈
 */
export const Toaster: React.FC = () => {
  const { toasts, dismiss } = useToastStore()
  const tr = useTr()

  return (
    <div
      className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2 pointer-events-none"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => {
        const { icon: Icon, accent, ring } = styles[t.type]
        return (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : undefined}
            className={`pointer-events-auto w-80 max-w-[calc(100vw-2.5rem)] bg-slate-900/95 backdrop-blur-md border ${ring} rounded-xl shadow-2xl shadow-black/40 px-3.5 py-3 flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 select-text`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${accent}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-100 leading-snug">{t.title}</div>
              {t.description && (
                <div className="text-[11px] text-slate-400 mt-0.5 break-all leading-relaxed line-clamp-4">
                  {t.description}
                </div>
              )}
              {t.path && (
                <button
                  onClick={() => window.electronAPI.showItemInFolder(t.path!)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-brand-300 hover:text-brand-200 transition-colors"
                >
                  <FolderOpen className="w-3 h-3" />
                  {tr('在文件夹中显示', 'Show in folder')}
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              aria-label={tr('关闭提示', 'Dismiss notification')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
