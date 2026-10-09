import { create } from 'zustand'

/**
 * 应用内参数询问对话框（Electron 不支持 window.prompt）。
 * 用法：const values = await askForm({ title, fields: [...] })；用户取消时返回 null。
 */
export type PromptFieldType = 'text' | 'number' | 'select' | 'segmented'

export interface PromptField {
  name: string
  label: string
  type: PromptFieldType
  defaultValue?: string | number
  options?: { value: string; label: string; hint?: string }[]
  min?: number
  max?: number
  step?: number
  suffix?: string
  hint?: string
  placeholder?: string
  required?: boolean
  /** 返回错误文案表示校验失败 */
  validate?: (value: any, all: Record<string, any>) => string | null
}

export interface PromptRequest {
  title: string
  description?: string
  fields: PromptField[]
  confirmText?: string
  cancelText?: string
  tone?: 'brand' | 'danger'
}

interface PromptState {
  request: PromptRequest | null
  resolver: ((values: Record<string, any> | null) => void) | null
  open: (req: PromptRequest) => Promise<Record<string, any> | null>
  close: (values: Record<string, any> | null) => void
}

export const usePromptStore = create<PromptState>((set, get) => ({
  request: null,
  resolver: null,
  open: (req) =>
    new Promise((resolve) => {
      // 若已有未完成的询问，视为取消
      get().resolver?.(null)
      set({ request: req, resolver: resolve })
    }),
  close: (values) => {
    get().resolver?.(values)
    set({ request: null, resolver: null })
  }
}))

export const askForm = (req: PromptRequest) => usePromptStore.getState().open(req)
