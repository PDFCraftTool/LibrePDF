import { create } from 'zustand'

export type FillSignToolType = 'text' | 'check' | 'cross' | 'dot' | 'date' | 'signature'

export interface FillSignItem {
  id: string
  type: FillSignToolType
  page: number
  xRatio: number // 0~1 相对于页面的 X 坐标
  yRatio: number // 0~1 相对于页面的 Y 坐标
  text?: string
  fontSize: number
  color: string
  signatureDataUrl?: string
  widthRatio?: number // 相对于页面宽度的比例（签名用）
  heightRatio?: number // 相对于页面高度的比例（签名用）
}

export interface SavedSignature {
  id: string
  name: string
  dataUrl: string
  createdAt: number
}

interface FillSignState {
  activeTool: FillSignToolType
  fontSize: number
  color: string
  items: FillSignItem[]
  savedSignatures: SavedSignature[]
  selectedItemId: string | null
  isSignatureModalOpen: boolean

  setActiveTool: (tool: FillSignToolType) => void
  setFontSize: (size: number) => void
  setColor: (color: string) => void
  addItem: (item: FillSignItem) => void
  updateItem: (id: string, patch: Partial<FillSignItem>) => void
  removeItem: (id: string) => void
  clearItems: () => void
  setSelectedItemId: (id: string | null) => void
  setSignatureModalOpen: (open: boolean) => void
  saveSignature: (dataUrl: string, name?: string) => void
  deleteSignature: (id: string) => void
}

const STORAGE_KEY = 'librepdf.saved_signatures'

const loadSavedSignatures = (): SavedSignature[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

export const useFillSignStore = create<FillSignState>((set, get) => ({
  activeTool: 'text',
  fontSize: 14,
  color: '#000000',
  items: [],
  savedSignatures: loadSavedSignatures(),
  selectedItemId: null,
  isSignatureModalOpen: false,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setFontSize: (fontSize) => set({ fontSize }),
  setColor: (color) => set({ color }),

  addItem: (item) =>
    set((state) => ({
      items: [...state.items, item],
      selectedItemId: item.id
    })),

  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((it) => (it.id === id ? { ...it, ...patch } : it))
    })),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((it) => it.id !== id),
      selectedItemId: state.selectedItemId === id ? null : state.selectedItemId
    })),

  clearItems: () => set({ items: [], selectedItemId: null }),

  setSelectedItemId: (id) => set({ selectedItemId: id }),

  setSignatureModalOpen: (open) => set({ isSignatureModalOpen: open }),

  saveSignature: (dataUrl, name = 'My Signature') => {
    const newSig: SavedSignature = {
      id: `sig_${Date.now()}`,
      name,
      dataUrl,
      createdAt: Date.now()
    }
    const updated = [newSig, ...get().savedSignatures]
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {}
    set({ savedSignatures: updated, isSignatureModalOpen: false })
  },

  deleteSignature: (id) => {
    const updated = get().savedSignatures.filter((s) => s.id !== id)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {}
    set({ savedSignatures: updated })
  }
}))
