import React, { useEffect, useRef, useState } from 'react'
import { useDocumentStore, ViewerMode, cleanIpcError } from '../../stores/useDocumentStore'
import { toast, useToastStore } from '../../stores/useToastStore'
import { askForm } from '../../stores/usePromptStore'
import { pdfjsLib, loadPdfDocument } from '../../lib/pdfjs'
import {
  FileUp,
  Sparkles,
  LayoutTemplate,
  Layers,
  Lock,
  ShieldCheck,
  MousePointer,
  Type,
  Highlighter,
  PenTool,
  Square,
  ShieldAlert,
  Check,
  X,
  Save,
  RotateCw,
  FileDown,
  FileImage,
  Images,
  ListTree,
  FileSignature,
  QrCode,
  Globe,
  GitCompare,
  CheckSquare,
  LayoutGrid,
  FileSpreadsheet,
  ScanLine,
  Compass,
  FileText,
  Scissors
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTr } from '../../i18n'
import { PageSidebar } from './PageSidebar'
import { PdfTextLayer } from './PdfTextLayer'
import { usePdfSearch, PdfSearchBar } from './PdfSearch'


export const PDFViewer: React.FC = () => {
  const { t } = useTranslation()
  const tr = useTr()
  const {
    tabs,
    activeTabId,
    showSidebar,
    openDocument,
    setCurrentPage,
    viewerMode,
    setViewerMode,
    pageTextBlocks,
    isLoadingBlocks,
    fetchPageTextBlocks,
    pendingEdits,
    isApplyingEdits,
    editFailures,
    enqueueTextEdit,
    clearPendingEdits,
    applyPendingEdits,
    saveAnnotation,
    setActiveDialog
  } = useDocumentStore()

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const renderTaskRef = useRef<any>(null)

  // 正文原地编辑状态
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [pageViewport, setPageViewport] = useState<{ width: number; height: number; scale: number } | null>(null)
  const [clientBlocks, setClientBlocks] = useState<any[]>([])

  // 正在编辑块的元数据快照（页码/矩形/字体属性），翻页与切块时用于自动入队
  const editingMetaRef = useRef<{
    page: number
    rect: number[]
    oldText: string
    fontName: string | null
    fontSize: number | null
    color: number[] | null
  } | null>(null)
  const [failedHoverKey, setFailedHoverKey] = useState<string | null>(null)

  // 手绘与批注持久化图层
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState<number[][]>([])
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [localStrokes, setLocalStrokes] = useState<number[][][]>([])
  const [localHighlights, setLocalHighlights] = useState<{ x: number; y: number; w: number; h: number }[]>([])
  const [localRedacts, setLocalRedacts] = useState<{ x: number; y: number; w: number; h: number }[]>([])
  const [isDragActive, setIsDragActive] = useState(false)
  const [dropError, setDropError] = useState('')
  const strokePointsRef = useRef<number[][]>([])
  // 当前页的 pdf.js 视口对象（文字层需要与画布使用同一个视口）
  const [pdfView, setPdfView] = useState<{ viewport: any; page: number } | null>(null)

  // 全文搜索
  const search = usePdfSearch(pdfDoc, activeTab?.currentPage ?? 1, setCurrentPage)

  // Ctrl+F 打开搜索（输入框内同样生效）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (!useDocumentStore.getState().activeTabId || useDocumentStore.getState().activeDialog !== 'none') return
        e.preventDefault()
        search.open()
      } else if (e.key === 'F3' && search.isOpen) {
        e.preventDefault()
        if (e.shiftKey) search.prev()
        else search.next()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [search])

  // 1. 加载活动 PDF 二进制流
  useEffect(() => {
    if (!activeTab || !activeTab.data) {
      setPdfDoc(null)
      return
    }

    let isCancelled = false
    // 使用本地 CMap / 标准字体（经主进程读取），不再依赖 CDN，离线可用
    const loadingTask = loadPdfDocument(activeTab.data.slice())

    loadingTask.promise.then(
      (doc) => {
        if (!isCancelled) {
          setPdfDoc(doc)
        }
      },
      (err) => {
        console.error('Error rendering PDF:', err)
      }
    )

    return () => {
      isCancelled = true
      // 销毁文档的同时清空 pdfDoc state，避免其他 effect 继续在已销毁的文档上调 getPage
      setPdfDoc(null)
      loadingTask.destroy()
    }
  }, [activeTab?.id, activeTab?.data])

  // 2. 渲染当前页到 Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !activeTab) return

    let isCancelled = false

    pdfDoc.getPage(activeTab.currentPage).then((page) => {
      // getPage 返回时文档可能已被切换/关闭时的 destroy 销毁，先检查取消标记，避免在失效文档上继续渲染
      if (isCancelled || (pdfDoc as any).destroyed) return

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
      }

      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const viewport = page.getViewport({
        scale: activeTab.scale,
        rotation: (activeTab.rotation || 0) + (page.rotate || 0)
      })

      setPageViewport({ width: viewport.width, height: viewport.height, scale: activeTab.scale })
      setPdfView({ viewport, page: activeTab.currentPage })

      const dpr = window.devicePixelRatio || 1
      canvas.width = viewport.width * dpr
      canvas.height = viewport.height * dpr
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      if (overlayCanvasRef.current) {
        overlayCanvasRef.current.width = viewport.width * dpr
        overlayCanvasRef.current.height = viewport.height * dpr
        overlayCanvasRef.current.style.width = `${viewport.width}px`
        overlayCanvasRef.current.style.height = `${viewport.height}px`
      }

      ctx.save()
      ctx.scale(dpr, dpr)

      const renderContext = {
        canvasContext: ctx,
        viewport
      }

      const task = page.render(renderContext)
      renderTaskRef.current = task

      task.promise
        .then(() => {
          // 渲染完成后若已被取消或文档已销毁，则不再恢复画布状态，避免残留旧文档页面
          if (isCancelled || (pdfDoc as any).destroyed) return
          ctx.restore()
        })
        .catch((err) => {
          if (err?.name !== 'RenderingCancelledException') {
            console.error('Render page error:', err)
          }
        })
    }).catch((err) => {
      // 文档销毁会导致 getPage 拒绝（MissingPDFException 等），属预期情况，忽略以免产生未处理 rejection
      if (!isCancelled && !(pdfDoc as any).destroyed && err?.name !== 'MissingPDFException') {
        console.error('getPage error:', err)
      }
    })

    return () => {
      isCancelled = true
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
      }
    }
  }, [pdfDoc, activeTab?.currentPage, activeTab?.scale, activeTab?.rotation])

  // 提取客户端纯前端文本块（秒级免 Python 回退保障）
  const extractClientBlocks = async (doc: any, pageNum: number) => {
    try {
      const page = await doc.getPage(pageNum)
      const textContent = await page.getTextContent()
      if (!textContent || !textContent.items || textContent.items.length === 0) {
        return []
      }
      const unscaledViewport = page.getViewport({ scale: 1.0 })
      const pdfHeight = unscaledViewport.height
      const blocks: any[] = []

      textContent.items.forEach((item: any, idx: number) => {
        if (!item.str || !item.str.trim()) return
        const tx = item.transform[4]
        const ty = item.transform[5]
        const fontHeight = Math.hypot(item.transform[2], item.transform[3]) || item.height || 12
        const width = item.width || item.str.length * fontHeight * 0.6

        // 统一转换为 72DPI 左上角坐标系
        const left = tx
        const top = pdfHeight - ty - fontHeight
        const right = tx + width
        const bottom = top + fontHeight

        blocks.push({
          id: `client_blk_${pageNum}_${idx}`,
          text: item.str,
          rect: [left, top, right, bottom],
          fontSize: Math.round(fontHeight),
          isClient: true
        })
      })
      return blocks
    } catch (err) {
      console.warn('extractClientBlocks error:', err)
      return []
    }
  }

  // 加载文本块（优先 Python 侧车，失败自动启用 PDF.js 客户端提取）
  const loadTextBlocks = async () => {
    if (!activeTab || !pdfDoc) return
    await fetchPageTextBlocks()
    const storeBlocks = useDocumentStore.getState().pageTextBlocks
    if (!storeBlocks || storeBlocks.length === 0) {
      const fallback = await extractClientBlocks(pdfDoc, activeTab.currentPage)
      setClientBlocks(fallback)
    } else {
      setClientBlocks([])
    }
  }

  useEffect(() => {
    if (viewerMode === 'edit_text' && activeTab && pdfDoc) {
      // 翻页/重载前：未入队的草稿自动入队，不再静默丢弃
      if (editingMetaRef.current && editingText.trim()) {
        const meta = editingMetaRef.current
        enqueueTextEdit({
          page: meta.page,
          blockId: editingBlockId || '',
          rect: meta.rect,
          oldText: meta.oldText,
          newText: editingText,
          fontName: meta.fontName,
          fontSize: meta.fontSize,
          color: meta.color
        })
      }
      editingMetaRef.current = null
      setEditingBlockId(null)
      loadTextBlocks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerMode, activeTab?.currentPage, pdfDoc])

  // 统一重绘持久化覆盖层（笔画、高亮、脱敏黑块）
  const redrawOverlay = () => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)

    // 1. 绘制高亮矩形
    ctx.fillStyle = 'rgba(250, 204, 21, 0.38)'
    for (const h of localHighlights) {
      ctx.fillRect(h.x, h.y, h.w, h.h)
    }

    // 2. 绘制脱敏黑块（物理纯黑遮盖）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)'
    for (const r of localRedacts) {
      ctx.fillRect(r.x, r.y, r.w, r.h)
    }

    // 3. 绘制手绘笔画
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of localStrokes) {
      if (stroke.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0][0], stroke[0][1])
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i][0], stroke[i][1])
      }
      ctx.stroke()
    }

    ctx.restore()
  }

  useEffect(() => {
    redrawOverlay()
  }, [localStrokes, localHighlights, localRedacts, pageViewport])

  // 处理手绘图层绘制交互
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewerMode === 'view' || viewerMode === 'edit_text') return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setIsDrawing(true)
    setStartPoint({ x, y })
    strokePointsRef.current = [[x, y]]
    setCurrentStroke([[x, y]])
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !overlayCanvasRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    strokePointsRef.current.push([x, y])
    redrawOverlay()

    const canvas = overlayCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1

    ctx.save()
    ctx.scale(dpr, dpr)

    if (viewerMode === 'pen') {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const pts = strokePointsRef.current
      if (pts.length > 1) {
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1])
        }
        ctx.stroke()
      }
    } else if (viewerMode === 'highlight' && startPoint) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.4)'
      ctx.fillRect(startPoint.x, startPoint.y, x - startPoint.x, y - startPoint.y)
    } else if (viewerMode === 'redact_draw' && startPoint) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.95)'
      ctx.fillRect(startPoint.x, startPoint.y, x - startPoint.x, y - startPoint.y)
    }

    ctx.restore()
  }

  const handleMouseUp = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    setIsDrawing(false)

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const scale = activeTab?.scale || 1.0
    // 用 pdf.js 官方 API 把视口 CSS 坐标转回未旋转的 PDF 用户空间坐标，天然处理旋转与偏移；
    // 此前仅除以 scale，页面带旋转（tab.rotation + page.rotate）时坐标会错位
    const viewport = pdfView && pdfView.page === activeTab?.currentPage ? pdfView.viewport : null
    const toPdfPoint = (cssX: number, cssY: number): number[] =>
      viewport ? viewport.convertToPdfPoint(cssX, cssY) : [cssX / scale, cssY / scale]

    if (viewerMode === 'pen' && strokePointsRef.current.length > 1) {
      const stroke = [...strokePointsRef.current]
      setLocalStrokes((prev) => [...prev, stroke])
      const pdfPoints = stroke.map((p) => toPdfPoint(p[0], p[1]))
      saveAnnotation('ink', { points: pdfPoints, color: [0.9, 0.1, 0.1] })
    } else if (viewerMode === 'highlight' && startPoint) {
      const rx = Math.min(startPoint.x, x)
      const ry = Math.min(startPoint.y, y)
      const rw = Math.abs(x - startPoint.x)
      const rh = Math.abs(y - startPoint.y)
      if (rw > 3 && rh > 3) {
        setLocalHighlights((prev) => [...prev, { x: rx, y: ry, w: rw, h: rh }])
        // 旋转后两个角点次序可能颠倒，用 min/max 归一化为合法矩形
        const [x1, y1] = toPdfPoint(rx, ry)
        const [x2, y2] = toPdfPoint(rx + rw, ry + rh)
        const pdfRect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]
        saveAnnotation('highlight', { rect: pdfRect, color: [1.0, 0.85, 0.0] })
      }
    } else if (viewerMode === 'redact_draw' && startPoint && activeTab) {
      const rx = Math.min(startPoint.x, x)
      const ry = Math.min(startPoint.y, y)
      const rw = Math.abs(x - startPoint.x)
      const rh = Math.abs(y - startPoint.y)
      if (rw > 3 && rh > 3) {
        setLocalRedacts((prev) => [...prev, { x: rx, y: ry, w: rw, h: rh }])
        const [x1, y1] = toPdfPoint(rx, ry)
        const [x2, y2] = toPdfPoint(rx + rw, ry + rh)
        const pdfRect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]
        // 修复：此前输入与输出都是 activeTab.filePath，未修改的文档会被直接覆盖原文件，
        // 且结果不会重新载入。现在写入临时工作副本，再应用到当前标签（可通过 Ctrl+S 决定是否落盘）
        void (async () => {
          try {
            const tempPath = await window.electronAPI.getTempPdfPath('pdfopen_redact')
            const res = await window.electronAPI.pythonRedact(
              activeTab.filePath,
              tempPath,
              activeTab.currentPage,
              [pdfRect],
              undefined,
              [0, 0, 0]
            )
            if (res.success && res.outputPath) {
              await useDocumentStore.getState().applyModifiedPDF(res.outputPath, { silent: true })
            } else {
              setLocalRedacts((prev) => prev.slice(0, -1))
              toast.error(tr('脱敏失败', 'Redaction failed'), res.error)
            }
          } catch (err) {
            setLocalRedacts((prev) => prev.slice(0, -1))
            toast.error(tr('脱敏失败', 'Redaction failed'), cleanIpcError(err))
          }
        })()
      }
    }

    setStartPoint(null)
    strokePointsRef.current = []
    setCurrentStroke([])
  }

  // 翻页、切换标签或文档内容被重新载入（批注已写入 PDF）后，清掉本地临时绘制层，避免残影或画到错误页面
  useEffect(() => {
    setLocalStrokes([])
    setLocalHighlights([])
    setLocalRedacts([])
  }, [activeTab?.id, activeTab?.currentPage, activeTab?.data])

  // 键盘翻页与缩放快捷键（输入框内不拦截）
  useEffect(() => {
    if (!activeTab) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (useDocumentStore.getState().isApplyingEdits) return
      if (e.key === 'Escape' && useDocumentStore.getState().viewerMode === 'edit_text') {
        void exitEditTextModeRef.current()
        return
      }
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (useDocumentStore.getState().activeDialog !== 'none') return
      const store = useDocumentStore.getState()
      const tab = store.tabs.find((t) => t.id === store.activeTabId)
      if (!tab) return

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          store.setScale((s) => s + 0.1)
        } else if (e.key === '-') {
          e.preventDefault()
          store.setScale((s) => s - 0.1)
        } else if (e.key === '0') {
          e.preventDefault()
          store.setScale(1)
        }
        return
      }
      if (e.altKey) return

      const container = containerRef.current
      const atTop = !container || container.scrollTop <= 0
      const atBottom = !container || container.scrollTop + container.clientHeight >= container.scrollHeight - 2

      switch (e.key) {
        case 'PageDown':
        case 'ArrowRight':
          e.preventDefault()
          store.setCurrentPage(tab.currentPage + 1)
          break
        case 'PageUp':
        case 'ArrowLeft':
          e.preventDefault()
          store.setCurrentPage(tab.currentPage - 1)
          break
        case 'ArrowDown':
          // 页面已滚动到底部时继续向下即翻到下一页
          if (atBottom && tab.currentPage < tab.pageCount) {
            e.preventDefault()
            store.setCurrentPage(tab.currentPage + 1)
          }
          break
        case 'ArrowUp':
          if (atTop && tab.currentPage > 1) {
            e.preventDefault()
            store.setCurrentPage(tab.currentPage - 1)
          }
          break
        case 'Home':
          e.preventDefault()
          store.setCurrentPage(1)
          break
        case 'End':
          e.preventDefault()
          store.setCurrentPage(tab.pageCount)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTab?.id])

  // Ctrl + 滚轮缩放（需 passive: false 才能阻止浏览器默认缩放）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.1 : -0.1
      useDocumentStore.getState().setScale((s) => Math.round((s + delta) * 100) / 100)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [activeTab?.id])

  // 翻页后让视口回到页面顶部
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 })
  }, [activeTab?.id, activeTab?.currentPage])

  // 把当前 textarea 草稿入队（瞬时，本地操作）；无草稿或空文本则只清理状态
  const enqueueCurrentDraft = () => {
    const meta = editingMetaRef.current
    if (editingBlockId && meta && editingText.trim()) {
      enqueueTextEdit({
        page: meta.page,
        blockId: editingBlockId,
        rect: meta.rect,
        oldText: meta.oldText,
        newText: editingText,
        fontName: meta.fontName,
        fontSize: meta.fontSize,
        color: meta.color
      })
    }
    editingMetaRef.current = null
    setEditingBlockId(null)
  }

  const handleApplyEdits = async () => {
    enqueueCurrentDraft()
    await applyPendingEdits() // toast 由 store 内部统一处理
  }

  const exitEditTextMode = async () => {
    enqueueCurrentDraft()
    const { pendingEdits: queue, applyPendingEdits: apply, clearPendingEdits: clear } =
      useDocumentStore.getState()
    if (queue.length > 0) {
      const res = await askForm({
        title: tr('存在未应用的文字修改', 'Unapplied text edits'),
        description: tr(
          `队列中有 ${queue.length} 处修改尚未写入文档。`,
          `${queue.length} queued edit(s) have not been applied yet.`
        ),
        fields: [
          {
            name: 'choice',
            label: tr('退出方式', 'How to exit'),
            type: 'segmented',
            defaultValue: 'apply',
            options: [
              { value: 'apply', label: tr('应用并退出', 'Apply & exit') },
              { value: 'discard', label: tr('放弃修改', 'Discard') }
            ]
          }
        ],
        confirmText: tr('确定', 'OK'),
        cancelText: tr('取消', 'Cancel')
      })
      if (!res) return // 用户取消，留在编辑模式
      if (res.choice === 'apply') await apply()
      else clear()
    }
    setViewerMode('view')
  }

  // 全局 keydown 监听依赖数组仅含 activeTab?.id，用 ref 转发最新闭包，避免 Esc 时读到过期的草稿状态
  const exitEditTextModeRef = useRef(exitEditTextMode)
  exitEditTextModeRef.current = exitEditTextMode

  const handleSelectFile = async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths && paths.length > 0) {
      await openDocument(paths[0])
    }
  }

  // 快捷执行：PDF 转 Word
  const handleQuickPdfToWord = async () => {
    const paths = await window.electronAPI.openFileDialog({
      multiSelections: false,
      filters: [{ name: tr('PDF 文档', 'PDF document'), extensions: ['pdf'] }]
    })
    if (!paths || paths.length === 0) return
    const inputPath = paths[0]
    const defaultOut = inputPath.replace(/\.pdf$/i, '.docx')
    const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
    if (!savePath) return

    const pending = toast.info(tr('正在转换为 Word…', 'Converting to Word…'), tr('大文件可能需要几十秒', 'Large files may take a while'))
    try {
      const res = await window.electronAPI.pdfToWord(inputPath, savePath)
      if (res.success && res.outputPath) {
        toast.success(tr('已导出 Word 文档', 'Word document exported'), res.outputPath, res.outputPath)
      } else {
        toast.error(tr('转 Word 失败', 'Conversion to Word failed'), res.error)
      }
    } catch (e: any) {
      toast.error(tr('转 Word 失败', 'Conversion to Word failed'), cleanIpcError(e))
    } finally {
      useToastStore.getState().dismiss(pending)
    }
  }

  // 先确保有打开的文档，再进入对应弹窗（用户取消选择文件时不应残留 activeDialog 状态）
  const openThenDialog = async (dialog: Parameters<typeof setActiveDialog>[0]) => {
    if (activeTab) {
      setActiveDialog(dialog)
      return
    }
    const paths = await window.electronAPI.openFileDialog({
      multiSelections: false,
      filters: [{ name: tr('PDF 文档', 'PDF document'), extensions: ['pdf'] }]
    })
    if (paths && paths.length > 0 && (await openDocument(paths[0]))) {
      setActiveDialog(dialog)
    }
  }

  // 快捷执行：按空白页拆分
  const handleQuickSplitByBlank = async () => {
    const paths = await window.electronAPI.openFileDialog({
      multiSelections: false,
      filters: [{ name: tr('PDF 文档', 'PDF document'), extensions: ['pdf'] }]
    })
    if (!paths || paths.length === 0) return
    const inputPath = paths[0]
    // 输出位置是一个文件夹，应使用目录选择器（此前误用了“保存文件”对话框）
    const dirs = await window.electronAPI.openFileDialog({ openDirectory: true })
    const outDir = dirs?.[0]
    if (!outDir) return
    const pending = toast.info(tr('正在检测空白页并拆分…', 'Detecting blank pages and splitting…'))
    try {
      const res = await window.electronAPI.pdfSplitByBlankPages(inputPath, outDir)
      if (res.success) {
        toast.success(tr(`拆分完成，共输出 ${res.partsCount ?? 0} 份 PDF`, `Split complete: ${res.partsCount ?? 0} PDF file(s)`), outDir, outDir)
      } else {
        toast.error(tr('拆分失败', 'Split failed'), res.error)
      }
    } catch (e: any) {
      toast.error(tr('拆分失败', 'Split failed'), cleanIpcError(e))
    } finally {
      useToastStore.getState().dismiss(pending)
    }
  }

  // 快捷执行：整页自动旋转回正
  const handleQuickAutoRotate = async () => {
    const paths = await window.electronAPI.openFileDialog({
      multiSelections: false,
      filters: [{ name: tr('PDF 文档', 'PDF document'), extensions: ['pdf'] }]
    })
    if (!paths || paths.length === 0) return
    const inputPath = paths[0]
    const defaultOut = inputPath.replace(/\.pdf$/i, '_autorotated.pdf')
    const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
    if (!savePath) return
    try {
      const res = await window.electronAPI.pdfAutoRotate(inputPath, savePath)
      if (res.success && res.outputPath) {
        toast.success(tr(`已自动扶正 ${res.count ?? res.rotatedPages?.length ?? 0} 页`, `Straightened ${res.count ?? res.rotatedPages?.length ?? 0} page(s)`), res.outputPath, res.outputPath)
        await openDocument(res.outputPath)
      } else {
        toast.error(tr('旋转回正失败', 'Auto-rotate failed'), res.error)
      }
    } catch (e: any) {
      toast.error(tr('旋转回正失败', 'Auto-rotate failed'), cleanIpcError(e))
    }
  }

  // 快捷执行：需要先打开文档的工具（未打开时先选择文件）
  const handleQuickTocEditor = () => openThenDialog('toc')
  const handleQuickDigitalSign = () => openThenDialog('digitalSign')
  const handleQuickFormDesigner = () => openThenDialog('formDesigner')

  if (!activeTab) {
    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-950/90 relative select-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_18%,rgba(20,184,166,0.10),transparent_54%),linear-gradient(180deg,#0c1415_0%,#080d10_100%)] pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center space-y-7 py-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-400/20 text-brand-200 text-[11px] font-semibold tracking-wide mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{tr('本地处理 · 文件留在你的设备', 'Processed locally · Files stay on your device')}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-50">{t('app.name')}</h1>
            <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
              {tr('阅读、整理和处理 PDF。先打开一份文档，常用操作会出现在工具栏中。', 'Read, organize and process PDFs. Open a document and common actions appear in the toolbar.')}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSelectFile}
            onDragEnter={(event) => {
              event.preventDefault()
              setDropError('')
              setIsDragActive(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragActive(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragActive(false)
              const file = Array.from(event.dataTransfer.files).find((item) => item.name.toLowerCase().endsWith('.pdf'))
              if (!file) {
                setDropError(tr('请选择 PDF 文件。', 'Please choose a PDF file.'))
                return
              }
              const filePath = window.electronAPI.getDroppedFilePath(file)
              if (filePath) void openDocument(filePath)
              else setDropError(tr('无法读取所拖入文件的位置，请点击打开按钮选择文件。', 'Couldn\'t read the dropped file\'s location. Click to choose the file instead.'))
            }}
            className={`w-full min-h-48 rounded-2xl p-8 cursor-pointer transition-all duration-200 group flex flex-col items-center justify-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
              isDragActive
                ? 'border-2 border-brand-300 bg-brand-500/10 shadow-[0_0_48px_-20px_rgba(45,212,191,0.5)]'
                : 'border border-dashed border-slate-600 bg-slate-900/55 hover:border-brand-400/70 hover:bg-slate-900/90 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.9)]'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-300/20 flex items-center justify-center text-brand-200 group-hover:bg-brand-500/15 transition-colors">
              <FileUp className="w-6 h-6" strokeWidth={1.7} />
            </div>
            <div className="text-center">
              <span className="text-base font-semibold text-slate-100 group-hover:text-brand-100 block">
                {isDragActive ? tr('松开鼠标以打开 PDF', 'Release to open the PDF') : tr('打开 PDF 文档', 'Open a PDF')}
              </span>
              <span className="text-xs text-slate-400 mt-1.5 block">
                {tr('点击浏览，或将 PDF 拖到此处', 'Click to browse, or drop a PDF here')} <span className="text-slate-500">·</span> Ctrl+O
              </span>
              {dropError && <span role="alert" className="text-xs text-rose-300 mt-2 block">{dropError}</span>}
            </div>
          </button>

          {/* 全能工具箱矩阵大 Banner 按钮 */}
          <div
            onClick={() => setActiveDialog('toolbox')}
            className="w-full p-4 rounded-2xl bg-slate-900/65 hover:bg-slate-900 border border-slate-700/80 hover:border-brand-400/40 cursor-pointer transition-all shadow-lg shadow-black/10 flex items-center justify-between group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') setActiveDialog('toolbox')
            }}
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-300/20 flex items-center justify-center text-brand-200 group-hover:bg-brand-500/15 transition-colors">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="flex items-center space-x-2">
                    <span className="font-semibold text-sm text-slate-100 group-hover:text-brand-100 transition-colors">
                    {tr('打开工具箱', 'Open toolbox')}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-semibold">
                    {tr('53+ 款工具', '53+ tools')}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {tr('按名称搜索 53+ 项 PDF 工具', 'Search 53+ PDF tools by name')}
                </p>
              </div>
            </div>
            <span className="text-xs text-brand-200 font-medium group-hover:translate-x-1 transition-transform pr-2">
              {tr('浏览工具箱', 'Browse toolbox')} →
            </span>
          </div>

          {/* 新增标杆功能与高频工具直达网格 */}
          <div className="w-full space-y-2.5">
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center space-x-1.5 font-bold text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                <span>{tr('常用工具', 'Featured tools')}</span>
              </div>
              <span className="text-[11px] text-slate-500">{tr('点击卡片选择文件或直接启动', 'Click a card to pick a file or start')}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {/* 1. PDF 转 Word */}
              <div
                onClick={handleQuickPdfToWord}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-blue-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-105 transition-transform">
                    <FileDown className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">
                    {tr('转 Word', 'To Word')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-blue-300 transition-colors">
                    {tr('PDF 转可编辑 Word', 'PDF to editable Word')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('导出为 .docx，尽量保留段落与版式', 'Export to .docx, keeping paragraphs and layout')}
                  </p>
                </div>
              </div>

              {/* 2. PDF 转图片 */}
              <div
                onClick={() => openThenDialog('pdfToImage')}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-rose-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 group-hover:scale-105 transition-transform">
                    <FileImage className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">
                    {tr('高清导出', 'High-res')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-rose-300 transition-colors">
                    {tr('PDF 逐页导出为图片', 'Export pages as images')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('PNG / JPG / WebP / TIFF 多档 DPI', 'PNG / JPG / WebP / TIFF, multiple DPI options')}
                  </p>
                </div>
              </div>

              {/* 3. 图片转 PDF */}
              <div
                onClick={() => setActiveDialog('imagesToPdf')}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-pink-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20 group-hover:scale-105 transition-transform">
                    <Images className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 font-semibold">
                    {tr('全格式', 'All formats')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-pink-300 transition-colors">
                    {tr('图片批量转 PDF', 'Images to PDF')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('JPG/PNG/WebP/TIFF/BMP 合成为 PDF', 'Combine JPG/PNG/WebP/TIFF/BMP into a PDF')}
                  </p>
                </div>
              </div>

              {/* 4. 大纲书签目录编辑器 */}
              <div
                onClick={handleQuickTocEditor}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-purple-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-105 transition-transform">
                    <ListTree className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold">
                    {tr('大纲树', 'Outline')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 transition-colors">
                    {tr('书签目录编辑器', 'Bookmark editor')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('可视化增删、重命名书签', 'Add, remove and rename bookmarks visually')}
                  </p>
                </div>
              </div>

              {/* 5. 数字签名与验签 */}
              <div
                onClick={handleQuickDigitalSign}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                    <FileSignature className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                    {tr('P12 证书', 'P12 certificate')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">
                    {tr('P12 证书数字签名', 'Digital signature with P12')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('签名并校验文档是否被篡改', 'Sign documents and check them for tampering')}
                  </p>
                </div>
              </div>

              {/* 6. 表单设计器 */}
              <div
                onClick={handleQuickFormDesigner}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition-transform">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                    {tr('设计器', 'Designer')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">
                    {tr('AcroForm 表单设计器', 'AcroForm designer')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('画框添加文本框、复选框、单选按钮', 'Draw text fields, checkboxes and radio buttons')}
                  </p>
                </div>
              </div>

              {/* 7. 按空白页自动切分 */}
              <div
                onClick={handleQuickSplitByBlank}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-amber-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                    <Scissors className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                    {tr('自动切分', 'Auto split')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                    {tr('按空白页自动拆分', 'Split by blank pages')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('批量扫描件按空白分隔页自动拆分', 'Split batch scans at blank separator pages')}
                  </p>
                </div>
              </div>

              {/* 8. 整页文字朝向自动旋转回正 */}
              <div
                onClick={handleQuickAutoRotate}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-105 transition-transform">
                    <Compass className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold">
                    {tr('自动回正', 'Auto-straighten')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                    {tr('按文字方向自动旋转页面', 'Auto-rotate by text direction')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('检测横置或倒置的页面并自动扶正', 'Detects sideways or upside-down pages and straightens them')}
                  </p>
                </div>
              </div>

              {/* 9. 双文档比对 */}
              <div
                onClick={() => setActiveDialog('compare')}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-teal-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-105 transition-transform">
                    <GitCompare className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-semibold">
                    {tr('差异标红', 'Highlight diffs')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-teal-300 transition-colors">
                    {tr('双文档差异比对', 'Compare two documents')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('逐页比对文字与图形变化，生成比对报告', 'Compares text and graphics page by page and creates a report')}
                  </p>
                </div>
              </div>

              {/* 10. 网页 URL / HTML 转高保真 PDF */}
              <div
                onClick={() => setActiveDialog('htmlToPdf')}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-sky-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-105 transition-transform">
                    <Globe className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-semibold">
                    {tr('网页转 PDF', 'Web to PDF')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-sky-300 transition-colors">
                    {tr('网页 URL / HTML 转 PDF', 'Web page URL / HTML to PDF')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('使用 Chromium 内核渲染', 'Rendered with the Chromium engine')}
                  </p>
                </div>
              </div>

              {/* 11. 复杂表格导出为 Excel */}
              <div
                onClick={() => openThenDialog('tableExtract')}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                    {tr('转 Excel', 'To Excel')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">
                    {tr('表格还原为 Excel (.xlsx)', 'Tables to Excel (.xlsx)')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('识别表格结构与合并单元格', 'Detects table structure and merged cells')}
                  </p>
                </div>
              </div>

              {/* 12. 仿真实体扫描件效果 */}
              <div
                onClick={() => openThenDialog('scanner')}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-yellow-500 hover:bg-slate-900 transition-all cursor-pointer group flex flex-col justify-between space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 group-hover:scale-105 transition-transform">
                    <ScanLine className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-semibold">
                    {tr('扫描质感', 'Scan look')}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-yellow-300 transition-colors">
                    {tr('模拟扫描件效果', 'Simulated scan effect')}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                    {tr('模拟复印机噪点、轻微倾斜与纸张暗角', 'Adds copier noise, slight skew and paper vignetting')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 底部三大保障徽标 */}
          <div className="grid grid-cols-3 gap-3 w-full pt-1">
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3 text-left flex items-center space-x-2.5">
              <ShieldCheck className="w-4 h-4 text-brand-400 shrink-0" />
              <div>
                <span className="text-xs font-medium text-slate-200 block">{tr('离线运行', 'Works offline')}</span>
                <span className="text-[10px] text-slate-500">{tr('无网络遥测，可商用', 'No telemetry, safe for commercial use')}</span>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3 text-left flex items-center space-x-2.5">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <span className="text-xs font-medium text-slate-200 block">{tr('AI 智能助手', 'AI Copilot')}</span>
                <span className="text-[10px] text-slate-500">{tr('连接本地 Ollama，用自然语言操作', 'Local Ollama, plain-language commands')}</span>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3 text-left flex items-center space-x-2.5">
              <LayoutTemplate className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <span className="text-xs font-medium text-slate-200 block">{tr('可视化连线工作流', 'Visual workflows')}</span>
                <span className="text-[10px] text-slate-500">{tr('基于节点的批处理流水线', 'Node-based batch pipelines')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden relative bg-slate-950">
      {/* 顶部浮动模式切换条 */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 border border-slate-700/80 rounded-full px-2 py-1 flex items-center space-x-1 shadow-2xl backdrop-blur-md text-xs select-none">
        <button
          onClick={() => (viewerMode === 'edit_text' ? void exitEditTextMode() : setViewerMode('view'))}
          className={`flex items-center space-x-1 px-3 py-1 rounded-full transition-all ${
            viewerMode === 'view' ? 'bg-brand-600 text-white font-medium shadow-sm' : 'text-slate-300 hover:text-white'
          }`}
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span>{tr('浏览', 'View')}</span>
        </button>

        <button
          onClick={() => setViewerMode('edit_text')}
          className={`flex items-center space-x-1 px-3 py-1 rounded-full transition-all ${
            viewerMode === 'edit_text'
              ? 'bg-blue-600 text-white font-medium shadow-sm ring-1 ring-blue-400'
              : 'text-slate-300 hover:text-white'
          }`}
          title={tr('点击页面上任何文本块直接修改正文', 'Click any text block on the page to edit it')}
        >
          <Type className={`w-3.5 h-3.5 ${viewerMode === 'edit_text' ? 'text-white' : 'text-blue-400'}`} />
          <span>{tr('正文编辑', 'Edit text')}</span>
        </button>

        <button
          onClick={() => setViewerMode('highlight')}
          className={`flex items-center space-x-1 px-3 py-1 rounded-full transition-all ${
            viewerMode === 'highlight'
              ? 'bg-amber-600 text-white font-medium shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Highlighter className={`w-3.5 h-3.5 ${viewerMode === 'highlight' ? 'text-white' : 'text-amber-400'}`} />
          <span>{tr('划词高亮', 'Highlight')}</span>
        </button>

        <button
          onClick={() => setViewerMode('pen')}
          className={`flex items-center space-x-1 px-3 py-1 rounded-full transition-all ${
            viewerMode === 'pen' ? 'bg-rose-600 text-white font-medium shadow-sm' : 'text-slate-300 hover:text-white'
          }`}
        >
          <PenTool className={`w-3.5 h-3.5 ${viewerMode === 'pen' ? 'text-white' : 'text-rose-400'}`} />
          <span>{tr('手绘批注', 'Draw')}</span>
        </button>

        <button
          onClick={() => setViewerMode('redact_draw')}
          className={`flex items-center space-x-1 px-3 py-1 rounded-full transition-all ${
            viewerMode === 'redact_draw'
              ? 'bg-rose-600 text-white font-semibold shadow-sm ring-1 ring-rose-400'
              : 'text-slate-300 hover:text-white'
          }`}
          title={tr('在页面上框选区域进行永久脱敏', 'Select an area on the page to redact it permanently')}
        >
          <ShieldAlert className={`w-3.5 h-3.5 ${viewerMode === 'redact_draw' ? 'text-white' : 'text-rose-400'}`} />
          <span>{tr('画框脱敏', 'Redact area')}</span>
        </button>
      </div>

      {/* 正文编辑模式引导提示 */}
      {viewerMode === 'edit_text' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 border border-blue-500/50 text-blue-200 text-xs px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-md flex items-center space-x-2 animate-in fade-in duration-200">
          {isLoadingBlocks ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
              <span>{tr('正在提取页面文本段落位置...', 'Detecting text blocks on this page...')}</span>
            </>
          ) : pageTextBlocks.length === 0 && clientBlocks.length === 0 ? (
            <>
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{tr('本页未检测到可选文本，若是扫描件请先执行 OCR', 'No selectable text on this page. For scanned pages, run OCR first.')}</span>
            </>
          ) : (
            <>
              <Type className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>{tr('点击蓝色虚线框修改文字，改完统一应用', 'Click a dashed box to edit; apply all changes at once')}</span>
            </>
          )}
          {pendingEdits.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-600/30 text-blue-100 text-[11px] font-medium">
              {tr(`${pendingEdits.length} 处待应用`, `${pendingEdits.length} pending`)}
            </span>
          )}
          <button
            onClick={handleApplyEdits}
            disabled={
              isApplyingEdits ||
              (pendingEdits.length === 0 && !(editingBlockId && editingText.trim())) ||
              (clientBlocks.length > 0 && pageTextBlocks.length === 0)
            }
            title={
              clientBlocks.length > 0 && pageTextBlocks.length === 0
                ? tr('当前为 PDF.js 回退模式，批量应用需要 Python 环境', 'Batch apply requires the Python sidecar (currently in PDF.js fallback)')
                : undefined
            }
            className="ml-1 px-2.5 py-0.5 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-medium"
          >
            {tr('应用修改', 'Apply')}
            {pendingEdits.length > 0 ? ` (${pendingEdits.length})` : ''}
          </button>
          {pendingEdits.length > 0 && (
            <button
              onClick={() => clearPendingEdits()}
              className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
            >
              {tr('放弃全部', 'Discard all')}
            </button>
          )}
          <button
            onClick={exitEditTextMode}
            className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
          >
            {tr('完成', 'Done')}
          </button>
        </div>
      )}

      {/* 绘制类模式的操作提示 */}
      {(viewerMode === 'highlight' || viewerMode === 'pen' || viewerMode === 'redact_draw') && (
        <div
          className={`absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 border text-xs px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-md flex items-center space-x-2 animate-in fade-in ${
            viewerMode === 'redact_draw' ? 'border-rose-500/50 text-rose-200' : 'border-amber-500/40 text-amber-100'
          }`}
        >
          {viewerMode === 'redact_draw' ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{tr('拖动框选区域即永久抹除其中内容（保存前可关闭标签放弃）', 'Drag to select an area and permanently remove its content (close the tab without saving to discard)')}</span>
            </>
          ) : viewerMode === 'pen' ? (
            <>
              <PenTool className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{tr('按住鼠标在页面上手绘，松开后自动写入批注', 'Hold the mouse button to draw; the annotation is saved when you release')}</span>
            </>
          ) : (
            <>
              <Highlighter className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{tr('拖动框选需要高亮的区域', 'Drag to select the area to highlight')}</span>
            </>
          )}
          <button
            onClick={() => setViewerMode('view')}
            className="ml-1 px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
          >
            {tr('完成', 'Done')}
          </button>
        </div>
      )}

      {/* 左侧抽屉：缩略图 */}
      {showSidebar && <PageSidebar pdfDoc={pdfDoc} />}

      {/* 全文搜索栏 (Ctrl+F) */}
      <PdfSearchBar search={search} />

      {/* 视口中央主画布 */}
      {/* 注意：不能用 items-center/justify-center 居中可滚动内容，放大后页面左/上部会被裁切而无法滚动到；
          改用子元素 m-auto 居中，内容超出时可完整滚动 */}
      <div
        ref={containerRef}
        data-pdf-viewport
        className="flex-1 overflow-auto flex px-8 pt-16 pb-10 bg-slate-950/90 relative"
      >
        <div
          className="pdf-page-shadow rounded overflow-hidden bg-white relative m-auto shrink-0"
          style={{
            width: pageViewport ? `${pageViewport.width}px` : 'auto',
            height: pageViewport ? `${pageViewport.height}px` : 'auto'
          }}
        >
          {/* 基础 PDF.js 渲染底图 */}
          <canvas ref={canvasRef} className="block" />

          {/* 文字层：浏览模式下可选择/复制文字，同时承载搜索高亮 */}
          <PdfTextLayer
            pdfDoc={pdfDoc}
            pageNumber={activeTab.currentPage}
            viewport={pdfView?.page === activeTab.currentPage ? pdfView.viewport : null}
            interactive={viewerMode === 'view'}
            highlights={search.pageHighlights}
          />

          {/* 交互绘制覆盖层 Canvas (高亮/画笔/脱敏) */}
          <canvas
            ref={overlayCanvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`absolute inset-0 z-10 ${
              viewerMode === 'pen'
                ? 'cursor-crosshair'
                : viewerMode === 'highlight' || viewerMode === 'redact_draw'
                ? 'cursor-cell'
                : 'pointer-events-none'
            }`}
          />

          {/* 正文可编辑模式覆盖层 (In-Place Text Blocks) */}
          {viewerMode === 'edit_text' && pageViewport && (
            <div className="absolute inset-0 z-20 pointer-events-auto">
              {(pageTextBlocks.length > 0 ? pageTextBlocks : clientBlocks).map((blk) => {
                const scale = pageViewport.scale
                const left = blk.rect[0] * scale
                const top = blk.rect[1] * scale
                const width = (blk.rect[2] - blk.rect[0]) * scale
                const height = (blk.rect[3] - blk.rect[1]) * scale

                const isEditing = editingBlockId === blk.id
                const curPage = activeTab?.currentPage ?? 1
                const pending = pendingEdits.find((e) => e.page === curPage && e.blockId === blk.id)
                const failureMsg = editFailures[`${curPage}:${blk.id}`]
                const overrideText = pending?.newText
                const displayText = overrideText !== undefined ? overrideText : blk.text

                return (
                  <div
                    key={blk.id}
                    onClick={() => {
                      if (isEditing || isApplyingEdits) return
                      enqueueCurrentDraft() // 切换块前把正在编辑的内容入队
                      setEditingBlockId(blk.id)
                      setEditingText(overrideText !== undefined ? overrideText : blk.text)
                      editingMetaRef.current = {
                        page: activeTab?.currentPage ?? 1,
                        rect: blk.rect,
                        oldText: blk.text,
                        fontName: blk.fontName ?? null,
                        fontSize: blk.fontSize ?? null,
                        color: blk.color ?? null
                      }
                    }}
                    title={failureMsg || undefined}
                    onMouseEnter={() => failureMsg && setFailedHoverKey(`${curPage}:${blk.id}`)}
                    onMouseLeave={() => setFailedHoverKey(null)}
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${Math.max(width, 30)}px`,
                      minHeight: `${Math.max(height, 20)}px`
                    }}
                    className={`absolute transition-all cursor-text rounded ${
                      isEditing
                        ? 'z-30 bg-white ring-2 ring-blue-500 shadow-2xl p-1.5'
                        : overrideText !== undefined
                        ? failureMsg
                          ? 'bg-white text-slate-900 border border-rose-500 shadow-sm px-1 font-sans text-xs flex items-center'
                          : 'bg-white text-slate-900 border border-emerald-500/80 shadow-sm px-1 font-sans text-xs flex items-center'
                        : 'border border-blue-400/50 hover:border-blue-600 hover:bg-blue-500/15'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex flex-col space-y-1">
                        <textarea
                          autoFocus
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="w-full text-slate-900 font-sans text-xs bg-transparent resize-none focus:outline-none leading-normal font-medium"
                          rows={Math.max(2, displayText.split('\n').length)}
                        />
                        <div className="flex items-center justify-end space-x-1 pt-1 border-t border-slate-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              editingMetaRef.current = null
                              setEditingBlockId(null)
                            }}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500"
                            title={tr('取消', 'Cancel')}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              enqueueCurrentDraft()
                            }}
                            className="flex items-center space-x-1 px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium shadow-sm"
                          >
                            <Check className="w-3 h-3" />
                            <span>{tr('加入队列', 'Queue')}</span>
                          </button>
                        </div>
                      </div>
                    ) : overrideText !== undefined ? (
                      <span>{overrideText}</span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 批量应用进度遮罩：锁定全部交互 */}
      {isApplyingEdits && (
        <div className="absolute inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-700 rounded-xl px-6 py-4 flex items-center space-x-3 shadow-2xl">
            <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            <span className="text-sm text-slate-200">
              {tr('正在应用文字修改…', 'Applying text edits…')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

