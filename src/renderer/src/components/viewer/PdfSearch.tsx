import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react'
import type { pdfjsLib } from '../../lib/pdfjs'
import type { HighlightSegment } from './PdfTextLayer'
import { useTr } from '../../i18n'

export interface SearchMatch {
  page: number
  segments: Omit<HighlightSegment, 'active'>[]
}

interface PageText {
  /** 小写后的整页文本 */
  text: string
  /** 每个文本项在 text 中的起始偏移与长度 */
  offsets: { start: number; length: number }[]
}

const isWordChar = (ch: string) => /[A-Za-z0-9]/.test(ch)

/** 读取并缓存整页文本；文本项顺序与文字层的 textDivs 一一对应 */
async function getPageText(doc: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<PageText> {
  const page = await doc.getPage(pageNum)
  const content = await page.getTextContent({ disableNormalization: true })
  let text = ''
  const offsets: PageText['offsets'] = []
  for (const item of content.items as any[]) {
    if (item.str === undefined) continue
    offsets.push({ start: text.length, length: item.str.length })
    text += item.str
    // 拉丁文字在换行处补一个空格，避免相邻两行的单词粘连；中文换行处不补，保证跨行仍能搜到
    if (item.hasEOL && item.str && isWordChar(item.str[item.str.length - 1])) text += ' '
  }
  return { text: text.toLowerCase(), offsets }
}

/** 把整页文本中的命中区间 [start, end) 拆分为各文本项内的片段 */
function toSegments(pt: PageText, start: number, end: number): SearchMatch['segments'] {
  const segs: SearchMatch['segments'] = []
  pt.offsets.forEach((o, item) => {
    const s = Math.max(start, o.start)
    const e = Math.min(end, o.start + o.length)
    if (e > s) segs.push({ item, start: s - o.start, end: e - o.start })
  })
  return segs
}

/**
 * 全文搜索：逐页提取文字并查找（不区分大小写），返回全部命中与当前选中项。
 */
export function usePdfSearch(pdfDoc: pdfjsLib.PDFDocumentProxy | null, currentPage: number, onNavigate: (page: number) => void) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [progress, setProgress] = useState(0)
  const cacheRef = useRef<Map<number, PageText>>(new Map())
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage

  // 文档内容变化（编辑、撤销）后缓存失效
  useEffect(() => {
    cacheRef.current = new Map()
  }, [pdfDoc])

  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!isOpen || !pdfDoc || !q) {
      setMatches([])
      setActiveIndex(-1)
      setIsSearching(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsSearching(true)
      const found: SearchMatch[] = []
      const total = pdfDoc.numPages
      for (let p = 1; p <= total; p++) {
        if (cancelled) return
        let pt = cacheRef.current.get(p)
        if (!pt) {
          try {
            pt = await getPageText(pdfDoc, p)
          } catch {
            continue
          }
          if (cancelled) return
          cacheRef.current.set(p, pt)
        }
        let from = 0
        while (true) {
          const idx = pt.text.indexOf(q, from)
          if (idx < 0) break
          found.push({ page: p, segments: toSegments(pt, idx, idx + q.length) })
          from = idx + q.length
        }
        if (p % 20 === 0) setProgress(Math.round((p / total) * 100))
      }
      if (cancelled) return
      setMatches(found)
      // 默认定位到当前页及之后的第一处结果
      const first = found.findIndex((m) => m.page >= currentPageRef.current)
      const idx = found.length === 0 ? -1 : first >= 0 ? first : 0
      setActiveIndex(idx)
      if (idx >= 0 && found[idx].page !== currentPageRef.current) onNavigate(found[idx].page)
      setIsSearching(false)
      setProgress(0)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, pdfDoc, isOpen])

  const go = (delta: 1 | -1) => {
    if (matches.length === 0) return
    const next = (activeIndex + delta + matches.length) % matches.length
    setActiveIndex(next)
    if (matches[next].page !== currentPage) onNavigate(matches[next].page)
  }

  /** 当前页需要渲染的高亮片段 */
  const pageHighlights = useMemo<HighlightSegment[]>(() => {
    if (!isOpen) return []
    const result: HighlightSegment[] = []
    matches.forEach((m, i) => {
      if (m.page !== currentPage) return
      for (const seg of m.segments) result.push({ ...seg, active: i === activeIndex })
    })
    return result
  }, [matches, activeIndex, currentPage, isOpen])

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    query,
    setQuery,
    matches,
    activeIndex,
    isSearching,
    progress,
    next: () => go(1),
    prev: () => go(-1),
    pageHighlights
  }
}

type SearchState = ReturnType<typeof usePdfSearch>

/** 浮动搜索栏（Ctrl+F 打开，Enter 下一个，Shift+Enter 上一个，Esc 关闭） */
export const PdfSearchBar: React.FC<{ search: SearchState }> = ({ search }) => {
  const tr = useTr()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (search.isOpen) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [search.isOpen])

  if (!search.isOpen) return null

  const hasQuery = search.query.trim().length > 0
  const status = search.isSearching
    ? search.progress > 0
      ? `${search.progress}%`
      : ''
    : hasQuery
      ? search.matches.length === 0
        ? tr('无结果', 'No results')
        : `${search.activeIndex + 1} / ${search.matches.length}`
      : ''

  return (
    <div
      className="absolute top-3 right-4 z-30 flex items-center gap-1 bg-slate-900/95 border border-slate-700/80 rounded-xl pl-2.5 pr-1 py-1 shadow-2xl backdrop-blur-md text-xs animate-in fade-in slide-in-from-top-2"
      role="search"
    >
      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <input
        ref={inputRef}
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) search.prev()
            else search.next()
          } else if (e.key === 'Escape') {
            // 标记已处理，避免全局 Esc 同时关闭其他界面
            e.preventDefault()
            e.stopPropagation()
            search.close()
          }
        }}
        placeholder={tr('在文档中搜索', 'Search in document')}
        aria-label={tr('在文档中搜索', 'Search in document')}
        className="w-48 bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none px-1 py-1"
      />
      <span
        className={`min-w-[52px] text-right font-mono text-[11px] ${
          hasQuery && !search.isSearching && search.matches.length === 0 ? 'text-rose-300' : 'text-slate-400'
        }`}
        aria-live="polite"
      >
        {search.isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" aria-label={tr('搜索中', 'Searching')} /> : null}
        {status}
      </span>
      <div className="h-4 w-px bg-slate-700 mx-1" />
      <button
        onClick={search.prev}
        disabled={search.matches.length === 0}
        className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300"
        title={tr('上一个 (Shift+Enter)', 'Previous (Shift+Enter)')}
        aria-label={tr('上一个', 'Previous')}
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={search.next}
        disabled={search.matches.length === 0}
        className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300"
        title={tr('下一个 (Enter)', 'Next (Enter)')}
        aria-label={tr('下一个', 'Next')}
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={search.close}
        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
        title={tr('关闭 (Esc)', 'Close (Esc)')}
        aria-label={tr('关闭搜索', 'Close search')}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
