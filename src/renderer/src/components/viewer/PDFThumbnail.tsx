import React, { useEffect, useRef, useState } from 'react'
import { useTr } from '../../i18n'

interface PDFThumbnailProps {
  pdfDoc: any
  pageNum: number
  isCurrent: boolean
  /** 多选状态（Ctrl / Shift 点击） */
  isSelected?: boolean
  /** 拖拽排序时的插入位置提示 */
  dropIndicator?: 'before' | 'after' | null
  isDragging?: boolean
  onClick: (e: React.MouseEvent | React.KeyboardEvent) => void
  /** 拖拽、右键菜单等事件透传到外层元素 */
  itemProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean }
}

const THUMB_WIDTH = 116

export const PDFThumbnail: React.FC<PDFThumbnailProps> = ({
  pdfDoc,
  pageNum,
  isCurrent,
  isSelected = false,
  dropIndicator = null,
  isDragging = false,
  onClick,
  itemProps
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isRendered, setIsRendered] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<number>(1.414)
  const tr = useTr()

  // 懒渲染：只有滚动到可视区域附近才渲染，避免大文档一次性渲染上百张缩略图导致卡顿
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '400px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 当前页缩略图自动滚动到可视区域
  useEffect(() => {
    if (isCurrent) wrapperRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [isCurrent])

  useEffect(() => {
    let cancelled = false
    let task: any = null

    if (!pdfDoc || !canvasRef.current || !isVisible) return
    // 文档内容更新（如旋转、编辑后重新载入）时需要重新渲染
    setIsRendered(false)

    pdfDoc
      .getPage(pageNum)
      .then((page: any) => {
        if (cancelled || !canvasRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const unscaled = page.getViewport({ scale: 1.0 })
        setAspectRatio(unscaled.height / unscaled.width)

        const scale = THUMB_WIDTH / unscaled.width
        const viewport = page.getViewport({ scale })

        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        task = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
        })

        task.promise
          .then(() => {
            if (!cancelled) setIsRendered(true)
          })
          .catch(() => {})
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (task) {
        try {
          task.cancel()
        } catch {}
      }
    }
  }, [pdfDoc, pageNum, isVisible])

  return (
    <div
      ref={wrapperRef}
      {...itemProps}
      onClick={onClick}
      role="option"
      aria-selected={isSelected || isCurrent}
      aria-current={isCurrent ? 'page' : undefined}
      aria-label={tr(`第 ${pageNum} 页`, `Page ${pageNum}`)}
      tabIndex={isCurrent ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(e)
        }
      }}
      className={`relative group flex flex-col items-center p-2 rounded-xl cursor-pointer transition-all border select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
        isDragging ? 'opacity-40' : ''
      } ${
        isCurrent
          ? 'bg-brand-500/10 border-brand-500/70 shadow-md ring-2 ring-brand-500/30'
          : isSelected
            ? 'bg-brand-500/5 border-brand-400/50 ring-1 ring-brand-400/30'
            : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/70 hover:border-slate-700'
      }`}
    >
      {/* 拖拽插入位置指示线 */}
      {dropIndicator && (
        <div
          className={`absolute left-1 right-1 h-0.5 rounded-full bg-brand-400 shadow-[0_0_6px_rgba(54,170,245,0.8)] pointer-events-none ${
            dropIndicator === 'before' ? '-top-2' : '-bottom-2'
          }`}
        />
      )}
      <div
        className="w-[116px] bg-white rounded-md shadow-md border border-slate-600/40 relative overflow-hidden flex items-center justify-center transition-transform group-hover:scale-[1.02]"
        style={{ minHeight: `${Math.round(THUMB_WIDTH * (aspectRatio || 1.414))}px` }}
      >
        {!isRendered && (
          <div className="absolute inset-0 bg-slate-800/90 flex flex-col items-center justify-center">
            <span className="text-xl font-bold opacity-20 text-white font-mono">{pageNum}</span>
          </div>
        )}
        <canvas ref={canvasRef} className="block shadow-sm" />
      </div>

      <div className="mt-2 flex items-center justify-center">
        <span
          className={`text-xs font-mono font-medium px-2.5 py-0.5 rounded-full transition-colors ${
            isCurrent
              ? 'bg-brand-600 text-white shadow-sm'
              : isSelected
                ? 'bg-brand-500/30 text-brand-100'
                : 'text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-800'
          }`}
        >
          {pageNum}
        </span>
      </div>
    </div>
  )
}
