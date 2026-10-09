import React, { useEffect, useRef, useState } from 'react'
import { pdfjsLib } from '../../lib/pdfjs'

/** 一处搜索命中在某个文本项（textContent.items 中带 str 的项）内的片段 */
export interface HighlightSegment {
  item: number
  start: number
  end: number
  /** 是否属于当前选中的搜索结果 */
  active?: boolean
}

interface PdfTextLayerProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  pageNumber: number
  /** 与画布渲染使用的同一个 pdf.js PageViewport（含缩放与旋转） */
  viewport: any
  /** 浏览模式下允许选择文字；绘制/编辑模式下不拦截鼠标 */
  interactive: boolean
  highlights: HighlightSegment[]
}

/**
 * pdf.js 文字层：在画布之上叠加与原文对齐的透明文字，使页面文字可以被选中、复制，
 * 同时用于渲染搜索高亮。
 */
export const PdfTextLayer: React.FC<PdfTextLayerProps> = ({ pdfDoc, pageNumber, viewport, interactive, highlights }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<any>(null)
  const touchedRef = useRef<Set<number>>(new Set())
  // 每次文字层重新渲染完成后递增，用于触发高亮重新应用
  const [renderVersion, setRenderVersion] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!pdfDoc || !viewport || !container) return
    let cancelled = false
    let layer: any = null

    container.replaceChildren()
    touchedRef.current = new Set()
    layerRef.current = null
    // pdf.js 文字层依赖 --scale-factor 计算字号与位置
    container.style.setProperty('--scale-factor', String(viewport.scale))

    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return
        layer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
          container,
          viewport
        })
        return layer.render().then(() => {
          if (cancelled) return
          // 末尾占位元素：拖选越过最后一行时不会选中整页
          const end = document.createElement('div')
          end.className = 'endOfContent'
          container.append(end)
          layerRef.current = layer
          setRenderVersion((v) => v + 1)
        })
      })
      .catch((err: any) => {
        if (!cancelled && err?.name !== 'AbortException') console.warn('Text layer render failed:', err)
      })

    return () => {
      cancelled = true
      try {
        layer?.cancel()
      } catch {}
    }
  }, [pdfDoc, pageNumber, viewport])

  // 应用搜索高亮：把命中的子串包裹为 <span class="pdfopen-hl">
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const divs: HTMLElement[] = layer.textDivs
    const strs: string[] = layer.textContentItemsStr

    // 先还原上一次被修改过的文本项
    for (const i of touchedRef.current) {
      if (divs[i]) divs[i].textContent = strs[i]
    }
    touchedRef.current = new Set()

    const byItem = new Map<number, HighlightSegment[]>()
    for (const seg of highlights) {
      if (!divs[seg.item]) continue
      const list = byItem.get(seg.item) || []
      list.push(seg)
      byItem.set(seg.item, list)
    }

    let activeEl: HTMLElement | null = null
    for (const [i, segs] of byItem) {
      const div = divs[i]
      const text = strs[i] || ''
      segs.sort((a, b) => a.start - b.start)
      div.textContent = ''
      let pos = 0
      for (const seg of segs) {
        const start = Math.max(pos, seg.start)
        const end = Math.min(text.length, seg.end)
        if (end <= start) continue
        if (start > pos) div.append(document.createTextNode(text.slice(pos, start)))
        const mark = document.createElement('span')
        mark.className = seg.active ? 'pdfopen-hl active' : 'pdfopen-hl'
        mark.textContent = text.slice(start, end)
        div.append(mark)
        if (seg.active && !activeEl) activeEl = mark
        pos = end
      }
      if (pos < text.length) div.append(document.createTextNode(text.slice(pos)))
      touchedRef.current.add(i)
    }

    activeEl?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [highlights, renderVersion])

  return (
    <div
      ref={containerRef}
      className={`textLayer z-[5] ${interactive ? '' : 'pointer-events-none'}`}
      aria-hidden={!interactive}
    />
  )
}
