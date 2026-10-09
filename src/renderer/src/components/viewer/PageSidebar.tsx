import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  RotateCw,
  RotateCcw,
  Trash2,
  FilePlus2,
  FileOutput,
  Copy,
  LayoutGrid,
  BookMarked,
  Loader2
} from 'lucide-react'
import type { pdfjsLib } from '../../lib/pdfjs'
import { useDocumentStore, cleanIpcError } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import { PDFThumbnail } from './PDFThumbnail'
import { OutlinePanel } from './OutlinePanel'

type OpResult = { success: boolean; outputPath?: string; error?: string; message?: string }

/** 把页码集合压缩成“1-3, 5”形式，用于提示与默认文件名 */
const formatPages = (pages: number[]) => {
  const sorted = [...pages].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++
    parts.push(start === sorted[i] ? `${start}` : `${start}-${sorted[i]}`)
  }
  return parts.join(', ')
}

/**
 * 左侧边栏：缩略图（支持多选、拖拽排序、右键整理页面）与书签大纲两个页签。
 * 所有页面操作都写入新的工作副本，可通过 Ctrl+Z 撤销。
 */
export const PageSidebar: React.FC<{ pdfDoc: pdfjsLib.PDFDocumentProxy | null }> = ({ pdfDoc }) => {
  const tr = useTr()
  const { tabs, activeTabId, setCurrentPage, sidebarTab, setSidebarTab } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const pageCount = activeTab?.pageCount ?? 0
  const currentPage = activeTab?.currentPage ?? 1

  const [selected, setSelected] = useState<Set<number>>(new Set([currentPage]))
  const anchorRef = useRef(currentPage)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const dragPagesRef = useRef<number[] | null>(null)
  const [draggingPages, setDraggingPages] = useState<number[]>([])
  const [dropTarget, setDropTarget] = useState<{ page: number; pos: 'before' | 'after' } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 切换文档或页数变化后重置选择
  useEffect(() => {
    setSelected(new Set([currentPage]))
    anchorRef.current = currentPage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, pageCount])

  // 从外部翻页（工具栏、键盘、搜索）时，若未多选，则选中跟随当前页
  useEffect(() => {
    setSelected((prev) => (prev.size <= 1 ? new Set([currentPage]) : prev))
  }, [currentPage])

  // 右键菜单：点击外部 / Esc / 滚动时关闭
  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if (e instanceof MouseEvent && menuRef.current?.contains(e.target as Node)) return
      setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenu(null)
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

  const selectedPages = useMemo(() => Array.from(selected).filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b), [selected, pageCount])

  if (!activeTab) return null

  const handleThumbClick = (page: number, e: React.MouseEvent | React.KeyboardEvent) => {
    if (e.shiftKey) {
      const [a, b] = [Math.min(anchorRef.current, page), Math.max(anchorRef.current, page)]
      setSelected(new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i)))
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(page) && next.size > 1) next.delete(page)
        else next.add(page)
        return next
      })
      anchorRef.current = page
    } else {
      setSelected(new Set([page]))
      anchorRef.current = page
    }
    setCurrentPage(page)
  }

  /** 统一执行页面操作：写入临时文件 → 应用到当前标签 → 提示可撤销 */
  const runOp = async (
    run: (src: string, out: string) => Promise<OpResult>,
    successTitle: string,
    after?: () => { page?: number; selection?: number[] }
  ) => {
    if (busy) return
    setMenu(null)
    setBusy(true)
    try {
      const out = await window.electronAPI.getTempPdfPath('pdfopen_pages')
      const res = await run(activeTab.filePath, out)
      if (!res.success || !res.outputPath) {
        toast.error(tr('页面操作失败', 'Page operation failed'), res.error || res.message)
        return
      }
      const ok = await useDocumentStore.getState().applyModifiedPDF(res.outputPath, { silent: true })
      if (!ok) return
      const next = after?.()
      if (next?.page) setCurrentPage(next.page)
      if (next?.selection) setSelected(new Set(next.selection))
      toast.success(successTitle, tr('可按 Ctrl+Z 撤销', 'Press Ctrl+Z to undo'))
    } catch (err) {
      toast.error(tr('页面操作失败', 'Page operation failed'), cleanIpcError(err))
    } finally {
      setBusy(false)
    }
  }

  const rotate = (angle: number) =>
    runOp(
      (src, out) => window.electronAPI.rotatePages(src, selectedPages, angle, out),
      tr(`已旋转第 ${formatPages(selectedPages)} 页`, `Rotated page(s) ${formatPages(selectedPages)}`)
    )

  const remove = () => {
    if (selectedPages.length >= pageCount) {
      toast.error(tr('不能删除全部页面', 'Cannot delete every page'), tr('PDF 至少需要保留一页', 'A PDF must keep at least one page'))
      return
    }
    const first = selectedPages[0]
    return runOp(
      (src, out) => window.electronAPI.deletePages(src, selectedPages, out),
      tr(`已删除 ${selectedPages.length} 页`, `Deleted ${selectedPages.length} page(s)`),
      () => {
        const page = Math.min(first, pageCount - selectedPages.length)
        return { page, selection: [page] }
      }
    )
  }

  const insertBlank = async (where: 'before' | 'after') => {
    const ref = where === 'before' ? selectedPages[0] : selectedPages[selectedPages.length - 1]
    // 空白页使用相邻页面的尺寸
    let width: number | undefined
    let height: number | undefined
    try {
      const page = await pdfDoc?.getPage(ref)
      if (page) {
        const [x0, y0, x1, y1] = page.view
        width = x1 - x0
        height = y1 - y0
      }
    } catch {}
    const index = where === 'before' ? ref - 1 : ref
    return runOp(
      (src, out) => window.electronAPI.insertBlankPage(src, index, width, height, out),
      tr(`已插入空白页（第 ${index + 1} 页）`, `Inserted a blank page (page ${index + 1})`),
      () => ({ page: index + 1, selection: [index + 1] })
    )
  }

  const duplicate = () => {
    const set = new Set(selectedPages)
    const order: number[] = []
    for (let p = 1; p <= pageCount; p++) {
      order.push(p)
      if (set.has(p)) order.push(p)
    }
    return runOp(
      (src, out) => window.electronAPI.reorderPages(src, order, out),
      tr(`已复制 ${selectedPages.length} 页`, `Duplicated ${selectedPages.length} page(s)`)
    )
  }

  const extract = async () => {
    setMenu(null)
    const base = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '')
    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: `${base}_p${formatPages(selectedPages).replace(/,\s*/g, '_')}.pdf`,
      filters: [{ name: tr('PDF 文档', 'PDF document'), extensions: ['pdf'] }]
    })
    if (!savePath) return
    setBusy(true)
    try {
      const res = await window.electronAPI.extractPages(activeTab.filePath, selectedPages, savePath)
      if (res.success) toast.success(tr(`已提取 ${selectedPages.length} 页为新文件`, `Extracted ${selectedPages.length} page(s) to a new file`), savePath, savePath)
      else toast.error(tr('提取失败', 'Extraction failed'), res.error || res.message)
    } catch (err) {
      toast.error(tr('提取失败', 'Extraction failed'), cleanIpcError(err))
    } finally {
      setBusy(false)
    }
  }

  // ---------------- 拖拽排序 ----------------
  const handleDragStart = (page: number, e: React.DragEvent) => {
    const pages = selected.has(page) ? selectedPages : [page]
    if (!selected.has(page)) setSelected(new Set([page]))
    dragPagesRef.current = pages
    setDraggingPages(pages)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-pdfopen-pages', pages.join(','))
  }

  const handleDragOver = (page: number, e: React.DragEvent) => {
    if (!dragPagesRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropTarget((prev) => (prev?.page === page && prev.pos === pos ? prev : { page, pos }))
  }

  const endDrag = () => {
    dragPagesRef.current = null
    setDraggingPages([])
    setDropTarget(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const pages = dragPagesRef.current
    const target = dropTarget
    endDrag()
    if (!pages || !target) return
    // 插入到“第 insertBefore 页之前”（N+1 表示末尾）
    const insertBefore = target.pos === 'before' ? target.page : target.page + 1
    const moving = new Set(pages)
    const rest = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => !moving.has(p))
    const at = rest.filter((p) => p < insertBefore).length
    const order = [...rest.slice(0, at), ...pages, ...rest.slice(at)]
    if (order.every((p, i) => p === i + 1)) return // 位置未变化
    const newPositions = pages.map((p) => order.indexOf(p) + 1)
    return runOp(
      (src, out) => window.electronAPI.reorderPages(src, order, out),
      tr(`已移动 ${pages.length} 页`, `Moved ${pages.length} page(s)`),
      () => ({ page: newPositions[0], selection: newPositions })
    )
  }

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete') {
      e.preventDefault()
      void remove()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSelected(new Set(Array.from({ length: pageCount }, (_, i) => i + 1)))
    }
  }

  const openMenu = (page: number, e: React.MouseEvent) => {
    e.preventDefault()
    if (!selected.has(page)) {
      setSelected(new Set([page]))
      anchorRef.current = page
    }
    // 防止菜单超出窗口
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 290) })
  }

  const count = selectedPages.length
  const menuItem = (icon: React.ElementType, label: string, onClick: () => void, opts: { danger?: boolean; hint?: string } = {}) => {
    const Icon = icon
    return (
      <button
        role="menuitem"
        disabled={busy}
        onClick={onClick}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left text-xs transition-colors disabled:opacity-40 ${
          opts.danger ? 'text-rose-300 hover:bg-rose-950/60' : 'text-slate-200 hover:bg-slate-800'
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1">{label}</span>
        {opts.hint && <span className="kbd">{opts.hint}</span>}
      </button>
    )
  }

  const tabButton = (key: 'thumbnails' | 'outline', Icon: React.ElementType, label: string) => (
    <button
      role="tab"
      aria-selected={sidebarTab === key}
      onClick={() => setSidebarTab(key)}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
        sidebarTab === key ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )

  const showOutline = sidebarTab === 'outline'

  return (
    <div className="w-56 bg-slate-900/90 border-r border-slate-800 flex flex-col select-none flex-shrink-0 min-h-0">
      <div className="px-2 py-1.5 border-b border-slate-800 flex items-center justify-between" role="tablist">
        <div className="flex items-center gap-0.5">
          {tabButton('thumbnails', LayoutGrid, tr('页面', 'Pages'))}
          {tabButton('outline', BookMarked, tr('书签', 'Bookmarks'))}
        </div>
        <span className="text-[11px] text-slate-500 font-mono pr-1 flex items-center gap-1">
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          {tr(`${pageCount} 页`, `${pageCount} pp`)}
        </span>
      </div>

      {showOutline ? (
        <OutlinePanel pdfDoc={pdfDoc} />
      ) : (
        <>
          <div
            className="flex-1 overflow-y-auto p-3 space-y-4 focus:outline-none"
            role="listbox"
            aria-multiselectable="true"
            aria-label={tr('页面缩略图', 'Page thumbnails')}
            tabIndex={-1}
            onKeyDown={handleListKeyDown}
            onDrop={handleDrop}
            onDragOver={(e) => dragPagesRef.current && e.preventDefault()}
          >
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
              <PDFThumbnail
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                isCurrent={pageNum === currentPage}
                isSelected={selected.has(pageNum)}
                isDragging={draggingPages.includes(pageNum)}
                dropIndicator={dropTarget?.page === pageNum ? dropTarget.pos : null}
                onClick={(e) => handleThumbClick(pageNum, e)}
                itemProps={{
                  draggable: !busy,
                  onDragStart: (e) => handleDragStart(pageNum, e),
                  onDragOver: (e) => handleDragOver(pageNum, e),
                  onDragEnd: endDrag,
                  onContextMenu: (e) => openMenu(pageNum, e)
                }}
              />
            ))}
          </div>

          {/* 底部快捷操作：作用于当前选中的页面 */}
          <div className="border-t border-slate-800 px-2 py-1.5 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 truncate" title={formatPages(selectedPages)}>
              {count > 1 ? tr(`已选 ${count} 页`, `${count} selected`) : tr(`第 ${selectedPages[0] ?? currentPage} 页`, `Page ${selectedPages[0] ?? currentPage}`)}
            </span>
            <div className="flex items-center">
              {[
                { icon: RotateCcw, label: tr('向左旋转', 'Rotate left'), run: () => rotate(-90) },
                { icon: RotateCw, label: tr('向右旋转', 'Rotate right'), run: () => rotate(90) },
                { icon: FilePlus2, label: tr('在后面插入空白页', 'Insert blank page after'), run: () => insertBlank('after') },
                { icon: Trash2, label: tr('删除 (Delete)', 'Delete (Delete)'), run: remove, danger: true }
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={b.run}
                  disabled={busy}
                  title={b.label}
                  aria-label={b.label}
                  className={`p-1.5 rounded-md disabled:opacity-40 transition-colors ${
                    b.danger ? 'text-slate-400 hover:text-rose-300 hover:bg-rose-950/50' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                >
                  <b.icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          </div>
          <p className="px-3 pb-2 text-[10px] text-slate-600 leading-snug">
            {tr('拖动缩略图调整顺序 · Ctrl/Shift 多选 · 右键更多操作', 'Drag to reorder · Ctrl/Shift to multi-select · Right-click for more')}
          </p>
        </>
      )}

      {/* 右键菜单 */}
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[80] w-52 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/50 p-1.5 animate-in fade-in zoom-in-95"
          style={{ left: menu.x, top: menu.y }}
        >
          <div className="px-3 pt-1 pb-1.5 text-[10px] text-slate-500 truncate">
            {count > 1 ? tr(`第 ${formatPages(selectedPages)} 页（共 ${count} 页）`, `Pages ${formatPages(selectedPages)} (${count})`) : tr(`第 ${selectedPages[0]} 页`, `Page ${selectedPages[0]}`)}
          </div>
          {menuItem(RotateCw, tr('向右旋转 90°', 'Rotate right 90°'), () => rotate(90))}
          {menuItem(RotateCcw, tr('向左旋转 90°', 'Rotate left 90°'), () => rotate(-90))}
          <div className="my-1 h-px bg-slate-800" />
          {menuItem(FilePlus2, tr('在前面插入空白页', 'Insert blank page before'), () => insertBlank('before'))}
          {menuItem(FilePlus2, tr('在后面插入空白页', 'Insert blank page after'), () => insertBlank('after'))}
          {menuItem(Copy, tr('复制页面', 'Duplicate'), duplicate)}
          {menuItem(FileOutput, tr('提取为新 PDF…', 'Extract to new PDF…'), extract)}
          <div className="my-1 h-px bg-slate-800" />
          {menuItem(Trash2, tr('删除', 'Delete'), remove, { danger: true, hint: 'Del' })}
        </div>
      )}
    </div>
  )
}
