import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  /** 可选：输出文件/目录路径，提供“在文件夹中显示”快捷按钮 */
  path?: string
  duration: number
}

interface ToastState {
  toasts: Toast[]
  show: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string
  dismiss: (id: string) => void
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    // 错误提示停留更久，便于阅读；最多同时保留 5 条
    const duration = toast.duration ?? (toast.type === 'error' ? 8000 : 4500)
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id, duration }] }))
    if (duration > 0) {
      timers.set(id, setTimeout(() => get().dismiss(id), duration))
    }
    return id
  },

  dismiss: (id) => {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
}))

/** 便捷调用，可在组件与 store 之外直接使用 */
export const toast = {
  success: (title: string, description?: string, path?: string) =>
    useToastStore.getState().show({ type: 'success', title, description, path }),
  error: (title: string, description?: string) =>
    useToastStore.getState().show({ type: 'error', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().show({ type: 'info', title, description }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().show({ type: 'warning', title, description })
}
