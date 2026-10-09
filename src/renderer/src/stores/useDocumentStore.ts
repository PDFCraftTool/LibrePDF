import { create } from 'zustand'
import type { PDFMetadata, TextEditItem } from '../../../shared/types'
import { toast } from './useToastStore'
import { tr } from '../i18n'

/** 去掉 Electron IPC 错误前缀 "Error invoking remote method 'xxx': Error: " */
export const cleanIpcError = (err: any): string => {
  const msg = String(err?.message || err || '')
  return msg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

export interface DocumentTab {
  id: string
  filePath: string
  originalFilePath: string
  fileName: string
  pageCount: number
  currentPage: number
  scale: number
  rotation: number
  metadata: PDFMetadata
  data: Uint8Array
  isModified?: boolean
  /** 编辑历史：每次修改都会生成新的工作副本，按顺序记录其路径，用于撤销/重做 */
  history: string[]
  historyIndex: number
  /** 最近一次保存时对应的历史位置（-1 表示该状态已被裁剪掉，任何位置都视为未保存） */
  savedIndex: number
}

/** 最多保留的历史步数 */
const MAX_HISTORY = 50

/** 文本块请求自增令牌：用于丢弃过期请求结果，防止快速翻页时旧页数据覆盖新页 */
let textBlocksRequestId = 0

export type ActiveDialog =
  | 'none'
  | 'merge'
  | 'split'
  | 'rotate'
  | 'watermark'
  | 'bates'
  | 'info'
  | 'popplerText'
  | 'popplerImages'
  | 'ocr'
  | 'tableExtract'
  | 'redact'
  | 'form'
  | 'hotfolder'
  | 'toolbox'
  | 'nup'
  | 'posterize'
  | 'booklet'
  | 'sanitize'
  | 'crop'
  | 'imagesToPdf'
  | 'scanner'
  | 'deskew'
  | 'removeBlank'
  | 'grayscale'
  | 'compare'
  | 'pageNumbers'
  | 'stamp'
  | 'compressRepair'
  | 'overlay'
  | 'toc'
  | 'htmlToPdf'
  | 'decrypt'
  | 'attachments'
  | 'formDesigner'
  | 'digitalSign'
  | 'pdfToImage'
export type ViewerMode = 'view' | 'edit_text' | 'highlight' | 'draw_rect' | 'pen' | 'redact_draw'

interface DocumentState {
  tabs: DocumentTab[]
  activeTabId: string | null
  showSidebar: boolean
  sidebarTab: 'thumbnails' | 'outline' | 'info'
  activeDialog: ActiveDialog
  viewerMode: ViewerMode
  pageTextBlocks: any[]
  isLoadingBlocks: boolean
  pendingEdits: TextEditItem[]
  isApplyingEdits: boolean
  /** 应用失败的编辑项：key = `${page}:${blockId}`，value = 失败原因 */
  editFailures: Record<string, string>
  
  // Actions
  openDocument: (filePath: string) => Promise<boolean>
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  setCurrentPage: (page: number) => void
  setScale: (scale: number | ((prev: number) => number)) => void
  setRotation: (rotation: number | ((prev: number) => number)) => void
  toggleSidebar: () => void
  setSidebarTab: (tab: 'thumbnails' | 'outline' | 'info') => void
  setActiveDialog: (dialog: ActiveDialog) => void
  setViewerMode: (mode: ViewerMode) => void
  fetchPageTextBlocks: () => Promise<void>
  saveTextEdit: (blockId: string, newText: string) => Promise<boolean>
  enqueueTextEdit: (item: TextEditItem) => void
  discardEdit: (page: number, blockId: string) => void
  clearPendingEdits: () => void
  applyPendingEdits: () => Promise<{ applied: number; failed: number; error?: string }>
  saveAnnotation: (annotType: string, options: any) => Promise<boolean>
  reloadCurrentDocument: () => Promise<void>
  applyModifiedPDF: (newFilePath: string, options?: { silent?: boolean }) => Promise<boolean>
  saveCurrentDocument: () => Promise<boolean>
  saveCurrentDocumentAs: () => Promise<boolean>
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  showSidebar: true,
  sidebarTab: 'thumbnails',
  activeDialog: 'none',
  viewerMode: 'view',
  pageTextBlocks: [],
  isLoadingBlocks: false,
  pendingEdits: [],
  isApplyingEdits: false,
  editFailures: {},

  openDocument: async (filePath: string) => {
    try {
      const existing = get().tabs.find((t) => t.filePath === filePath || t.originalFilePath === filePath)
      if (existing) {
        set({ activeTabId: existing.id, pendingEdits: [], editFailures: {} })
        // 工具多次输出到同一路径时，已打开的标签仍是旧内容；若无未保存修改则从磁盘刷新
        if (!existing.isModified) {
          try {
            const fresh = await window.electronAPI.readPDFFile(existing.filePath)
            set((state) => ({
              tabs: state.tabs.map((t) =>
                t.id === existing.id
                  ? {
                      ...t,
                      data: fresh.data,
                      metadata: fresh.metadata,
                      pageCount: fresh.metadata.pageCount,
                      currentPage: Math.min(t.currentPage, fresh.metadata.pageCount)
                    }
                  : t
              )
            }))
          } catch {
            // 刷新失败时保留现有内容即可
          }
        }
        return true
      }

      const res = await window.electronAPI.readPDFFile(filePath)
      const fileName = filePath.split(/[/\\]/).pop() || 'Untitled.pdf'
      const newTab: DocumentTab = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        filePath,
        originalFilePath: filePath,
        fileName,
        pageCount: res.metadata.pageCount,
        currentPage: 1,
        scale: 1.0,
        rotation: 0,
        metadata: res.metadata,
        data: res.data,
        isModified: false,
        history: [filePath],
        historyIndex: 0,
        savedIndex: 0
      }

      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
        pendingEdits: [],
        editFailures: {}
      }))
      return true
    } catch (err: any) {
      console.error('Failed to open PDF:', err)
      const fileName = filePath.split(/[/\\]/).pop() || filePath
      toast.error(
        tr(`无法打开 ${fileName}`, `Couldn't open ${fileName}`),
        cleanIpcError(err) ||
          tr('文件可能已损坏、被加密或正被其他程序占用', 'The file may be damaged, encrypted, or in use by another program')
      )
      return false
    }
  },

  closeTab: (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (
      tab?.isModified &&
      !window.confirm(
        tr(
          `“${tab.fileName}”有未保存的修改，确定要关闭吗？\n\n关闭后修改将丢失。`,
          `"${tab.fileName}" has unsaved changes. Close it anyway?\n\nYour changes will be lost.`
        )
      )
    ) {
      return
    }
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== tabId)
      let nextActiveId = state.activeTabId
      if (state.activeTabId === tabId) {
        nextActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null
      }
      const closedActive = state.activeTabId === tabId
      return {
        tabs: newTabs,
        activeTabId: nextActiveId,
        // 仅在关闭的是当前文档时清空待应用队列
        ...(closedActive ? { pendingEdits: [], editFailures: {} } : {})
      }
    })
  },

  setActiveTab: (tabId: string) =>
    set((s) =>
      // 仅在真正切换文档时清空待应用队列；重复点击当前标签不应丢弃排队中的修改
      s.activeTabId === tabId
        ? { activeTabId: tabId }
        : { activeTabId: tabId, pendingEdits: [], editFailures: {} }
    ),

  setCurrentPage: (page: number) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? { ...tab, currentPage: Math.max(1, Math.min(tab.pageCount, page)) }
          : tab
      )
    }))
  },

  setScale: (scaleOrFn) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id === state.activeTabId) {
          const newScale = typeof scaleOrFn === 'function' ? scaleOrFn(tab.scale) : scaleOrFn
          return { ...tab, scale: Math.max(0.25, Math.min(4.0, newScale)) }
        }
        return tab
      })
    }))
  },

  setRotation: (rotationOrFn) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id === state.activeTabId) {
          const newRot = typeof rotationOrFn === 'function' ? rotationOrFn(tab.rotation) : rotationOrFn
          return { ...tab, rotation: (newRot % 360 + 360) % 360 }
        }
        return tab
      })
    }))
  },

  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setActiveDialog: (dialog) => set({ activeDialog: dialog }),

  setViewerMode: (mode) => {
    set({ viewerMode: mode })
    if (mode === 'edit_text') {
      get().fetchPageTextBlocks()
    }
  },

  fetchPageTextBlocks: async () => {
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) return

    // 记录本次请求令牌：异步返回时若已有更新的请求发出，则丢弃本次结果，避免旧页数据覆盖新页
    const requestId = ++textBlocksRequestId
    set({ isLoadingBlocks: true })
    try {
      const res = await window.electronAPI.pythonGetTextBlocks(activeTab.filePath, activeTab.currentPage)
      if (requestId !== textBlocksRequestId) return
      if (res.success && res.blocks) {
        set({ pageTextBlocks: res.blocks })
      } else {
        set({ pageTextBlocks: [] })
      }
    } catch {
      if (requestId !== textBlocksRequestId) return
      set({ pageTextBlocks: [] })
    } finally {
      // 仅当仍是最新请求时才复位 loading，避免旧请求提前结束新请求的加载态
      if (requestId === textBlocksRequestId) {
        set({ isLoadingBlocks: false })
      }
    }
  },

  saveTextEdit: async (blockId: string, newText: string) => {
    const { activeTabId, tabs, pageTextBlocks } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    const block = pageTextBlocks.find((b) => b.id === blockId)
    if (!activeTab || !block) return false

    try {
      const outputPath = await window.electronAPI.getTempPdfPath('pdfopen_text_edit')
      const res = await window.electronAPI.pythonEditText(
        activeTab.filePath,
        outputPath,
        activeTab.currentPage,
        block.rect,
        newText,
        block.fontSize
      )

      if (res.success && res.outputPath) {
        const applied = await get().applyModifiedPDF(res.outputPath, { silent: true })
        if (!applied) return false
        await get().fetchPageTextBlocks()
        return true
      }
      toast.error(tr('文字修改失败', 'Failed to edit text'), res.error)
      return false
    } catch (err) {
      console.error('Save text edit error:', err)
      return false
    }
  },

  enqueueTextEdit: (item) =>
    set((s) => ({
      // 同页同块后改优先覆盖；入队即清除该项旧的失败标记
      pendingEdits: [
        ...s.pendingEdits.filter((e) => !(e.page === item.page && e.blockId === item.blockId)),
        item
      ],
      editFailures: Object.fromEntries(
        Object.entries(s.editFailures).filter(([k]) => k !== `${item.page}:${item.blockId}`)
      )
    })),

  discardEdit: (page, blockId) =>
    set((s) => ({
      pendingEdits: s.pendingEdits.filter((e) => !(e.page === page && e.blockId === blockId))
    })),

  clearPendingEdits: () => set({ pendingEdits: [], editFailures: {} }),

  applyPendingEdits: async () => {
    const { activeTabId, tabs, pendingEdits, isApplyingEdits } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab || pendingEdits.length === 0 || isApplyingEdits) {
      return { applied: 0, failed: 0 }
    }
    const startedTabId = activeTabId
    set({ isApplyingEdits: true, editFailures: {} })
    try {
      const outputPath = await window.electronAPI.getTempPdfPath('pdfopen_text_batch')
      const res = await window.electronAPI.pythonEditTextBatch(
        activeTab.filePath,
        outputPath,
        pendingEdits
      )
      if (!res.success || !res.outputPath) {
        toast.error(tr('文字修改失败', 'Failed to edit text'), res.error)
        return { applied: 0, failed: pendingEdits.length, error: res.error }
      }
      const okIndexes = new Set((res.results || []).filter((r) => r.ok).map((r) => r.index))
      const applied = okIndexes.size
      const failedItems = pendingEdits.filter((_, idx) => !okIndexes.has(idx))
      const failures: Record<string, string> = {}
      for (const r of res.results || []) {
        if (!r.ok) {
          const item = pendingEdits[r.index]
          if (item) {
            failures[`${item.page}:${item.blockId}`] = r.error || tr('未知错误', 'Unknown error')
          }
        }
      }
      // 批量 python 处理期间用户可能切换/关闭标签页：applyModifiedPDF 按当时的
      // activeTabId 落盘，必须校验目标未变，否则结果会写进错误文档（临时文件废弃即可）
      if (get().activeTabId !== startedTabId) {
        return {
          applied: 0,
          failed: pendingEdits.length,
          error: tr('文档已切换，修改未应用', 'Document switched, edits not applied')
        }
      }
      // 一次批量 = 一条 undo 历史
      const reloadOk = await get().applyModifiedPDF(res.outputPath, { silent: true })
      if (!reloadOk) return { applied: 0, failed: pendingEdits.length }
      await get().fetchPageTextBlocks()
      // fetchPageTextBlocks 亦为异步，落状态前再次确认文档未切换，避免污染新文档的队列
      if (get().activeTabId !== startedTabId) {
        return {
          applied: 0,
          failed: pendingEdits.length,
          error: tr('文档已切换，修改未应用', 'Document switched, edits not applied')
        }
      }

      // 失败项 rect 可能因同页先前编辑的文本回流而过时：按 oldText 在新块中重新对位；
      // 对不上的项从队列移除并提示重新选择，避免用旧坐标重放擦错位置。
      // 失败项在其他页时无法本地校验 rect 是否过时（pageTextBlocks 仅含当前页），按原样保留，重放时由 Python 侧校验兜底。
      const cur = get()
      const curTab = cur.tabs.find((t) => t.id === cur.activeTabId)
      const kept: TextEditItem[] = []
      for (const item of failedItems) {
        if (curTab && item.page === curTab.currentPage) {
          const match = cur.pageTextBlocks.find((b) => b.text === item.oldText)
          if (match) {
            // 已对位到新块，旧 blockId 的失败标记作废（本次是重试而非展示失败）
            delete failures[`${item.page}:${item.blockId}`]
            kept.push({ ...item, blockId: match.id, rect: match.rect })
            continue
          }
          failures[`${item.page}:${item.blockId}`] = tr(
            '位置已失效，请重新选择文本块',
            'Position stale, please re-select the text block'
          )
          continue
        }
        kept.push(item)
      }
      // 合并而非覆盖：应用期间用户可能新入队/重改（enqueueTextEdit 对未触及项保留引用，
      // 被覆盖项是新对象），按引用与快照区分；同页同块以在飞项为准
      set((s) => {
        const snapshot = new Set(pendingEdits)
        const inFlight = s.pendingEdits.filter((e) => !snapshot.has(e))
        const inFlightKeys = new Set(inFlight.map((e) => `${e.page}:${e.blockId}`))
        return {
          pendingEdits: [...kept.filter((e) => !inFlightKeys.has(`${e.page}:${e.blockId}`)), ...inFlight],
          editFailures: { ...s.editFailures, ...failures }
        }
      })

      const summary =
        tr(`成功应用 ${applied} 处修改`, `${applied} edit(s) applied`) +
        (kept.length > 0 ? tr(`，${kept.length} 处失败`, `, ${kept.length} failed`) : '')
      if (kept.length > 0) {
        toast.error(tr('部分文字修改失败', 'Some edits failed'), summary)
      } else {
        toast.success(tr('文字修改已应用', 'Text edits applied'), summary)
      }
      return { applied, failed: kept.length }
    } catch (err: any) {
      console.error('applyPendingEdits error:', err)
      const message = cleanIpcError(err)
      toast.error(tr('文字修改失败', 'Failed to edit text'), message)
      return { applied: 0, failed: pendingEdits.length, error: message }
    } finally {
      set({ isApplyingEdits: false })
    }
  },

  saveAnnotation: async (annotType: string, options: any) => {
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) return false

    try {
      const outputPath = await window.electronAPI.getTempPdfPath('pdfopen_annotation')
      const res = await window.electronAPI.pythonAddAnnotation(
        activeTab.filePath,
        outputPath,
        activeTab.currentPage,
        annotType,
        options
      )

      if (res.success && res.outputPath) {
        return await get().applyModifiedPDF(res.outputPath, { silent: true })
      }
      toast.error(tr('批注保存失败', 'Failed to save annotation'), res.error)
      return false
    } catch (err: any) {
      console.error('Save annotation error:', err)
      toast.error(tr('批注保存失败', 'Failed to save annotation'), cleanIpcError(err))
      return false
    }
  },

  reloadCurrentDocument: async () => {
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) return

    try {
      const res = await window.electronAPI.readPDFFile(activeTab.filePath)
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                data: res.data,
                metadata: res.metadata,
                pageCount: res.metadata.pageCount,
                currentPage: Math.min(t.currentPage, res.metadata.pageCount)
              }
            : t
        )
      }))
    } catch (err) {
      console.error('Reload failed:', err)
    }
  },

  applyModifiedPDF: async (newFilePath: string, options?: { silent?: boolean }) => {
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) return false

    try {
      const res = await window.electronAPI.readPDFFile(newFilePath)
      set((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id !== activeTabId) return t
          // 丢弃“重做”分支，追加新状态；超出上限时从最旧处裁剪
          let history = [...t.history.slice(0, t.historyIndex + 1), newFilePath]
          let savedIndex = t.savedIndex
          const overflow = history.length - MAX_HISTORY
          if (overflow > 0) {
            history = history.slice(overflow)
            savedIndex = savedIndex - overflow
          }
          const historyIndex = history.length - 1
          return {
            ...t,
            filePath: newFilePath,
            data: res.data,
            metadata: res.metadata,
            pageCount: res.metadata.pageCount,
            currentPage: Math.min(t.currentPage, res.metadata.pageCount),
            history,
            historyIndex,
            savedIndex: savedIndex < 0 ? -1 : savedIndex,
            isModified: true
          }
        }),
        activeDialog: 'none'
      }))
      if (!options?.silent) {
        toast.success(
          tr('修改已应用到当前文档', 'Changes applied to the current document'),
          tr('按 Ctrl+S 覆盖保存，或使用“另存为”导出新文件', 'Press Ctrl+S to save, or use "Save As" to export a new file')
        )
      }
      return true
    } catch (err: any) {
      console.error('Failed to apply modified PDF:', err)
      toast.error(tr('处理结果载入失败', 'Failed to load the result'), cleanIpcError(err))
      return false
    }
  },

  saveCurrentDocument: async () => {
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) return false

    const targetPath = activeTab.originalFilePath || activeTab.filePath
    // 没有修改且工作副本就是原文件时无需复制（避免源/目标相同导致的异常）
    if (!activeTab.isModified && activeTab.filePath === targetPath) {
      toast.info(tr('文档没有需要保存的修改', 'No changes to save'))
      return true
    }
    try {
      const res = await window.electronAPI.saveCurrentFile(activeTab.filePath, targetPath)
      if (res.success) {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === activeTabId
              ? { ...t, originalFilePath: targetPath, isModified: false, savedIndex: t.historyIndex }
              : t
          )
        }))
        toast.success(tr('已保存', 'Saved'), targetPath, targetPath)
        return true
      }
      toast.error(tr('保存失败，请尝试另存为', 'Save failed. Try "Save As"'), res.error)
      return false
    } catch (err: any) {
      console.error('Save failed:', err)
      toast.error(tr('保存失败，请尝试另存为', 'Save failed. Try "Save As"'), cleanIpcError(err))
      return false
    }
  },

  saveCurrentDocumentAs: async () => {
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) return false

    const defaultPath = activeTab.originalFilePath || activeTab.filePath
    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath,
      filters: [{ name: tr('PDF 文档', 'PDF document'), extensions: ['pdf'] }]
    })
    if (!savePath) return false

    try {
      const res = await window.electronAPI.saveCurrentFile(activeTab.filePath, savePath)
      if (res.success) {
        const fileName = savePath.split(/[/\\]/).pop() || activeTab.fileName
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === activeTabId
              ? {
                  ...t,
                  filePath: savePath,
                  originalFilePath: savePath,
                  fileName,
                  isModified: false,
                  // 当前历史位置的内容已与新文件一致，直接指向新文件
                  history: t.history.map((p, i) => (i === t.historyIndex ? savePath : p)),
                  savedIndex: t.historyIndex
                }
              : t
          )
        }))
        toast.success(tr('已另存为新文件', 'Saved as new file'), savePath, savePath)
        return true
      }
      toast.error(tr('另存为失败', 'Save As failed'), res.error)
      return false
    } catch (err: any) {
      console.error('Save as failed:', err)
      toast.error(tr('另存为失败', 'Save As failed'), cleanIpcError(err))
      return false
    }
  },

  undo: () => jumpHistory(-1),
  redo: () => jumpHistory(1)
}))

/** 在当前标签的编辑历史中前后移动并载入对应的工作副本 */
async function jumpHistory(delta: -1 | 1): Promise<boolean> {
  const { activeTabId, tabs } = useDocumentStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab) return false
  const target = tab.historyIndex + delta
  if (target < 0 || target >= tab.history.length) return false
  const path = tab.history[target]
  try {
    const res = await window.electronAPI.readPDFFile(path)
    useDocumentStore.setState((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tab.id
          ? {
              ...t,
              filePath: path,
              data: res.data,
              metadata: res.metadata,
              pageCount: res.metadata.pageCount,
              currentPage: Math.min(t.currentPage, res.metadata.pageCount),
              historyIndex: target,
              isModified: target !== t.savedIndex
            }
          : t
      )
    }))
    return true
  } catch (err) {
    // 临时文件被系统清理等情况：提示并保持当前状态
    toast.error(
      delta < 0 ? tr('无法撤销', 'Cannot undo') : tr('无法重做', 'Cannot redo'),
      cleanIpcError(err) || tr('历史版本文件已不存在', 'The history file no longer exists')
    )
    return false
  }
}

