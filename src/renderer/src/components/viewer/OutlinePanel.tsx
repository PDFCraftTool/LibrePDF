import React, { useEffect, useState } from 'react'
import { ChevronRight, BookMarked, ExternalLink, Loader2 } from 'lucide-react'
import type { pdfjsLib } from '../../lib/pdfjs'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { useTr } from '../../i18n'

interface OutlineNode {
  title: string
  dest: string | any[] | null
  url?: string | null
  bold?: boolean
  italic?: boolean
  items: OutlineNode[]
}

/** 将书签的目标（命名目标或显式目标数组）解析为 1 起始的页码 */
async function resolveDestPage(doc: pdfjsLib.PDFDocumentProxy, dest: OutlineNode['dest']): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const ref = explicit[0]
    if (typeof ref === 'number') return ref + 1
    if (ref && typeof ref === 'object') return (await doc.getPageIndex(ref)) + 1
  } catch {
    // 目标失效（例如该页已被删除）
  }
  return null
}

const OutlineItem: React.FC<{
  node: OutlineNode
  depth: number
  onOpen: (node: OutlineNode) => void
  defaultOpen: boolean
}> = ({ node, depth, onOpen, defaultOpen }) => {
  const tr = useTr()
  const [open, setOpen] = useState(defaultOpen)
  const hasChildren = node.items && node.items.length > 0

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined}>
      <div
        className="group flex items-center gap-0.5 rounded-md hover:bg-slate-800/80 text-slate-300 hover:text-slate-100"
        style={{ paddingLeft: depth * 12 }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-0.5 rounded text-slate-500 hover:text-slate-200 shrink-0"
            aria-label={open ? tr('折叠', 'Collapse') : tr('展开', 'Expand')}
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          onClick={() => onOpen(node)}
          title={node.title}
          className={`flex-1 min-w-0 text-left py-1 pr-1.5 text-[11px] leading-snug truncate ${node.bold ? 'font-semibold' : ''} ${
            node.italic ? 'italic' : ''
          }`}
        >
          {node.title || '—'}
        </button>
        {node.url && <ExternalLink className="w-3 h-3 text-slate-500 shrink-0 mr-1" />}
      </div>
      {hasChildren && open && (
        <ul role="group">
          {node.items.map((child, i) => (
            <OutlineItem key={i} node={child} depth={depth + 1} onOpen={onOpen} defaultOpen={false} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** 书签大纲侧栏：读取 PDF 自带的大纲，点击跳转到对应页 */
export const OutlinePanel: React.FC<{ pdfDoc: pdfjsLib.PDFDocumentProxy | null }> = ({ pdfDoc }) => {
  const tr = useTr()
  const { setCurrentPage, setActiveDialog } = useDocumentStore()
  const [outline, setOutline] = useState<OutlineNode[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!pdfDoc) {
      setOutline(null)
      return
    }
    let cancelled = false
    setLoading(true)
    pdfDoc
      .getOutline()
      .then((items) => !cancelled && setOutline((items as OutlineNode[]) || []))
      .catch(() => !cancelled && setOutline([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [pdfDoc])

  const handleOpen = async (node: OutlineNode) => {
    if (!pdfDoc) return
    if (node.url) {
      // 外部链接由主进程交给系统浏览器打开
      window.open(node.url, '_blank')
      return
    }
    const page = await resolveDestPage(pdfDoc, node.dest)
    if (page) setCurrentPage(page)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" aria-label={tr('加载中', 'Loading')} />
      </div>
    )
  }

  if (!outline || outline.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-4 text-center">
        <BookMarked className="w-6 h-6 text-slate-600" />
        <p className="text-[11px] text-slate-500 leading-relaxed">{tr('此文档没有书签大纲', 'This document has no bookmarks')}</p>
        <button
          onClick={() => setActiveDialog('toc')}
          className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
        >
          {tr('创建书签', 'Create bookmarks')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <ul role="tree" aria-label={tr('书签大纲', 'Bookmarks')} className="space-y-0.5">
        {outline.map((node, i) => (
          <OutlineItem key={i} node={node} depth={0} onOpen={handleOpen} defaultOpen={outline.length <= 12} />
        ))}
      </ul>
      <button
        onClick={() => setActiveDialog('toc')}
        className="mt-3 w-full text-[11px] py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
      >
        {tr('编辑书签…', 'Edit bookmarks…')}
      </button>
    </div>
  )
}
