import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, MousePointerClick } from 'lucide-react'
import { loadPdfDocument } from '../../lib/pdfjs'
import { useTr } from '../../i18n'

/**
 * PDF 用户空间矩形：左下角原点，(x, y) 为矩形左下角，单位 pt。
 * 与 pdf-lib 的 drawImage / addToPage 以及签名 rect [x, y, x + width, y + height] 约定一致。
 */
export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PickerRect {
  id: string
  label?: string
  rect: PdfRect
  /** 指定所在页（从 1 开始）；若提供则只在该页显示 */
  page?: number
}

export interface PagePositionPickerProps {
  /** PDF 原始字节（每次变化才重新加载文档） */
  data: Uint8Array
  pageNumber: number
  pageCount: number
  onPageChange: (page: number) => void
  /** rect：在空白处拖拽绘制新矩形；point：点击/拖拽放置固定尺寸的框 */
  mode: 'rect' | 'point'
  rects?: PickerRect[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  /** 绘制新矩形（id 为 null）或移动/缩放已有矩形后回调，坐标为 PDF 用户空间 */
  onChange: (rect: PdfRect, id: string | null) => void
  /** point 模式下尚无选中框时使用的默认尺寸（PDF pt） */
  defaultSize?: { width: number; height: number }
  /** 预览区宽度（CSS 像素） */
  width?: number
  hint?: string
  /** 是否允许缩放手柄 */
  resizable?: boolean
  /** 页面加载后回调页面 view 框 [x0, y0, x1, y1]（PDF 用户空间，未旋转） */
  onPageInfo?: (info: { pageNumber: number; view: number[]; rotate: number }) => void
}

interface CssRect {
  left: number
  top: number
  w: number
  h: number
}

interface DragState {
  kind: 'draw' | 'move' | 'resize'
  id: string | null
  startX: number
  startY: number
  orig: CssRect
  pointerId: number
}

const MIN_CSS = 6

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export const PagePositionPicker: React.FC<PagePositionPickerProps> = ({
  data,
  pageNumber,
  pageCount,
  onPageChange,
  mode,
  rects = [],
  selectedId = null,
  onSelect,
  onChange,
  defaultSize = { width: 120, height: 120 },
  width = 420,
  hint,
  resizable = true,
  onPageInfo
}) => {
  const tr = useTr()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  // 回调存入 ref，避免父组件每次渲染传入新函数导致页面重绘
  const onPageInfoRef = useRef(onPageInfo)
  onPageInfoRef.current = onPageInfo

  const [doc, setDoc] = useState<any>(null)
  const [viewport, setViewport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraftState] = useState<{ id: string | null; rect: CssRect } | null>(null)
  // 同步保存一份到 ref，保证 pointerup 时读取到最新草稿
  const draftRef = useRef<{ id: string | null; rect: CssRect } | null>(null)
  const setDraft = (v: { id: string | null; rect: CssRect } | null) => {
    draftRef.current = v
    setDraftState(v)
  }

  const total = Math.max(1, pageCount || doc?.numPages || 1)
  const safePage = clamp(Math.round(pageNumber) || 1, 1, total)

  // 文档只在数据变化时加载一次，翻页不重新解析
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    const task = loadPdfDocument(data.slice())
    task.promise
      .then((d: any) => {
        if (!cancelled) setDoc(d)
      })
      .catch((err: any) => {
        if (!cancelled) {
          setLoadError(err?.message || 'load failed')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
      setDoc(null)
      setViewport(null)
      try {
        task.destroy()
      } catch {}
    }
  }, [data])

  // 渲染当前页；翻页/卸载时取消未完成的渲染任务
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    let renderTask: any = null
    setLoading(true)

    doc
      .getPage(safePage)
      .then((page: any) => {
        if (cancelled || !canvasRef.current) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const unscaled = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: width / unscaled.width })
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(vp.width * dpr)
        canvas.height = Math.floor(vp.height * dpr)
        canvas.style.width = `${vp.width}px`
        canvas.style.height = `${vp.height}px`
        setViewport(vp)
        onPageInfoRef.current?.({ pageNumber: safePage, view: Array.from(page.view as number[]), rotate: page.rotate || 0 })

        renderTask = page.render({
          canvasContext: ctx,
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
        })
        return renderTask.promise.then(() => {
          if (!cancelled) setLoading(false)
        })
      })
      .catch((err: any) => {
        // 取消渲染属于正常流程，不提示错误
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          setLoadError(err?.message || 'render failed')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      if (renderTask) {
        try {
          renderTask.cancel()
        } catch {}
      }
    }
  }, [doc, safePage, width])

  // PDF 用户空间 → 预览 CSS 像素（自动处理旋转）
  const pdfToCss = useCallback(
    (r: PdfRect): CssRect | null => {
      if (!viewport) return null
      const [ax, ay] = viewport.convertToViewportPoint(r.x, r.y)
      const [bx, by] = viewport.convertToViewportPoint(r.x + r.width, r.y + r.height)
      return { left: Math.min(ax, bx), top: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
    },
    [viewport]
  )

  // 预览 CSS 像素 → PDF 用户空间（左下角原点，取整到 pt）
  const cssToPdf = useCallback(
    (c: CssRect): PdfRect | null => {
      if (!viewport) return null
      const [ax, ay] = viewport.convertToPdfPoint(c.left, c.top)
      const [bx, by] = viewport.convertToPdfPoint(c.left + c.w, c.top + c.h)
      const x = Math.min(ax, bx)
      const y = Math.min(ay, by)
      return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(1, Math.round(Math.abs(bx - ax))),
        height: Math.max(1, Math.round(Math.abs(by - ay)))
      }
    },
    [viewport]
  )

  const visibleRects = rects.filter((r) => r.page === undefined || r.page === safePage)

  const localPoint = (e: React.PointerEvent) => {
    const box = overlayRef.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  const bounds = () => ({ W: viewport?.width ?? 0, H: viewport?.height ?? 0 })

  const fitInside = (c: CssRect): CssRect => {
    const { W, H } = bounds()
    const w = Math.min(c.w, W)
    const h = Math.min(c.h, H)
    return { left: clamp(c.left, 0, W - w), top: clamp(c.top, 0, H - h), w, h }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!viewport || e.button !== 0) return
    const p = localPoint(e)
    const target = e.target as HTMLElement
    const handleEl = target.closest('[data-resize-id]') as HTMLElement | null
    const boxEl = target.closest('[data-box-id]') as HTMLElement | null

    let state: DragState | null = null

    if (handleEl) {
      const id = handleEl.dataset.resizeId!
      const item = visibleRects.find((r) => r.id === id)
      const css = item && pdfToCss(item.rect)
      if (css) state = { kind: 'resize', id, startX: p.x, startY: p.y, orig: css, pointerId: e.pointerId }
    } else if (boxEl) {
      const id = boxEl.dataset.boxId!
      const item = visibleRects.find((r) => r.id === id)
      const css = item && pdfToCss(item.rect)
      if (id !== selectedId) onSelect?.(id)
      if (css) state = { kind: 'move', id, startX: p.x, startY: p.y, orig: css, pointerId: e.pointerId }
    } else if (mode === 'rect') {
      state = {
        kind: 'draw',
        id: null,
        startX: p.x,
        startY: p.y,
        orig: { left: p.x, top: p.y, w: 0, h: 0 },
        pointerId: e.pointerId
      }
    } else {
      // point 模式：以点击处为中心放置当前选中框（或默认尺寸），随后可继续拖动
      const sel = visibleRects.find((r) => r.id === selectedId)
      const sizeCss = pdfToCss(sel ? sel.rect : { x: 0, y: 0, ...defaultSize })
      if (sizeCss) {
        const placed = fitInside({ left: p.x - sizeCss.w / 2, top: p.y - sizeCss.h / 2, w: sizeCss.w, h: sizeCss.h })
        setDraft({ id: sel ? sel.id : null, rect: placed })
        state = { kind: 'move', id: sel ? sel.id : null, startX: p.x, startY: p.y, orig: placed, pointerId: e.pointerId }
      }
    }

    if (state) {
      e.preventDefault()
      dragRef.current = state
      overlayRef.current?.setPointerCapture(e.pointerId)
      overlayRef.current?.focus()
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const { W, H } = bounds()
    const p = localPoint(e)
    const px = clamp(p.x, 0, W)
    const py = clamp(p.y, 0, H)
    const dx = p.x - d.startX
    const dy = p.y - d.startY
    let next: CssRect
    if (d.kind === 'draw') {
      next = { left: Math.min(d.startX, px), top: Math.min(d.startY, py), w: Math.abs(px - d.startX), h: Math.abs(py - d.startY) }
    } else if (d.kind === 'resize') {
      next = {
        left: d.orig.left,
        top: d.orig.top,
        w: clamp(d.orig.w + dx, MIN_CSS, W - d.orig.left),
        h: clamp(d.orig.h + dy, MIN_CSS, H - d.orig.top)
      }
    } else {
      next = fitInside({ ...d.orig, left: d.orig.left + dx, top: d.orig.top + dy })
    }
    setDraft({ id: d.id, rect: next })
  }

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    try {
      overlayRef.current?.releasePointerCapture(e.pointerId)
    } catch {}
    const current = draftRef.current
    setDraft(null)
    if (!commit || !current) return
    if (d.kind === 'draw' && (current.rect.w < MIN_CSS || current.rect.h < MIN_CSS)) {
      // 过小视为单击空白：取消选择
      onSelect?.(null)
      return
    }
    const pdf = cssToPdf(current.rect)
    if (pdf) onChange(pdf, current.id)
  }

  // 键盘微调：方向键移动选中框 1px（Shift 为 10px）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    }
    const k = keys[e.key]
    if (!k) return
    const sel = visibleRects.find((r) => r.id === selectedId)
    const css = sel && pdfToCss(sel.rect)
    if (!sel || !css) return
    e.preventDefault()
    const step = e.shiftKey ? 10 : 1
    const moved = fitInside({ ...css, left: css.left + k[0] * step, top: css.top + k[1] * step })
    const pdf = cssToPdf(moved)
    if (pdf) onChange(pdf, sel.id)
  }

  const defaultHint =
    mode === 'rect'
      ? tr(
          '在页面上按住鼠标拖拽绘制区域；拖动框体可移动，拖动右下角手柄可调整大小，方向键可微调。',
          'Drag on the page to draw an area. Drag a box to move it, drag its bottom-right handle to resize, or nudge it with the arrow keys.'
        )
      : tr(
          '点击页面放置框，拖动框体可移动，拖动右下角手柄可调整大小，方向键可微调。',
          'Click the page to place the box. Drag it to move, drag the bottom-right handle to resize, or nudge it with the arrow keys.'
        )

  // 草稿中的新框（id 为 null）单独绘制
  const newDraft = draft && draft.id === null ? draft.rect : null

  return (
    <div className="flex flex-col items-center space-y-2 text-xs" style={{ width }}>
      {/* 翻页栏 */}
      <div className="w-full flex items-center justify-between">
        <button
          type="button"
          onClick={() => onPageChange(clamp(safePage - 1, 1, total))}
          disabled={safePage <= 1}
          aria-label={tr('上一页', 'Previous page')}
          title={tr('上一页', 'Previous page')}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-slate-300 font-mono" aria-live="polite">
          {tr(`第 ${safePage} / ${total} 页`, `Page ${safePage} / ${total}`)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(clamp(safePage + 1, 1, total))}
          disabled={safePage >= total}
          aria-label={tr('下一页', 'Next page')}
          title={tr('下一页', 'Next page')}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 页面预览与交互层 */}
      <div
        className="relative bg-white rounded-md shadow-lg border border-slate-700 overflow-hidden"
        style={{ width, minHeight: viewport ? viewport.height : Math.round(width * 1.414) }}
      >
        <canvas ref={canvasRef} className="block" />

        <div
          ref={overlayRef}
          role="application"
          tabIndex={0}
          aria-label={tr('页面位置选择区', 'Page position picker')}
          className="absolute inset-0 cursor-crosshair touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => finishDrag(e, true)}
          onPointerCancel={(e) => finishDrag(e, false)}
          onKeyDown={handleKeyDown}
        >
          {viewport &&
            visibleRects.map((item) => {
              const css = draft && draft.id === item.id ? draft.rect : pdfToCss(item.rect)
              if (!css) return null
              const selected = item.id === selectedId
              return (
                <div
                  key={item.id}
                  data-box-id={item.id}
                  className={`absolute cursor-move border-2 ${
                    selected
                      ? 'border-brand-500 bg-brand-500/20 z-10'
                      : 'border-sky-500/70 bg-sky-400/10 hover:bg-sky-400/20'
                  }`}
                  style={{ left: css.left, top: css.top, width: css.w, height: css.h }}
                >
                  {item.label && (
                    <span
                      className={`absolute left-0 ${css.top < 16 ? 'top-full' : '-top-4'} px-1 rounded-sm text-[9px] leading-4 font-mono whitespace-nowrap pointer-events-none ${
                        selected ? 'bg-brand-600 text-white' : 'bg-sky-700/90 text-white'
                      }`}
                    >
                      {item.label}
                    </span>
                  )}
                  {selected && resizable && (
                    <span
                      data-resize-id={item.id}
                      aria-hidden="true"
                      className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-brand-500 border border-white cursor-nwse-resize"
                    />
                  )}
                </div>
              )
            })}

          {newDraft && (
            <div
              className="absolute border-2 border-dashed border-brand-500 bg-brand-500/15 pointer-events-none"
              style={{ left: newDraft.left, top: newDraft.top, width: newDraft.w, height: newDraft.h }}
            />
          )}
        </div>

        {(loading || loadError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 pointer-events-none">
            {loadError ? (
              <span className="text-rose-300 px-3 text-center">
                {tr('页面预览加载失败：', 'Failed to load page preview: ')}
                {loadError}
              </span>
            ) : (
              <Loader2 className="w-6 h-6 text-slate-300 animate-spin" aria-label={tr('加载中', 'Loading')} />
            )}
          </div>
        )}
      </div>

      <p className="w-full flex items-start space-x-1.5 text-[11px] text-slate-400 leading-relaxed">
        <MousePointerClick className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-400" />
        <span>{hint || defaultHint}</span>
      </p>
    </div>
  )
}
