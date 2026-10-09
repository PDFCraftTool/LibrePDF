import React, { useState, useEffect } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, ListTree, Plus, Trash2, ArrowUp, ArrowDown, CheckCircle2, AlertCircle, Bookmark } from 'lucide-react'
import { useTr } from '../../i18n'

interface TocItem {
  level: number
  title: string
  page: number
}

export const TOCEditorDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  const [tocList, setTocList] = useState<TocItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (activeDialog === 'toc' && activeTab) {
      loadToc()
    }
    // 仅在弹窗打开或切换到另一份文件时重新读取；不能依赖 activeTab 对象本身，
    // 否则翻页/缩放（会生成新的 tab 对象）会触发重新加载并清空未保存的编辑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDialog, activeTab?.id, activeTab?.filePath])

  if (activeDialog !== 'toc') return null

  const loadToc = async () => {
    if (!activeTab) return
    setIsLoading(true)
    setErrorMsg('')
    try {
      const res = await window.electronAPI.pdfGetToc(activeTab.filePath)
      if (res.success && res.toc) {
        setTocList(res.toc)
      } else {
        setTocList([])
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('读取目录失败', 'Failed to read table of contents'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddItem = (level: number = 1) => {
    const newPage = activeTab ? activeTab.currentPage : 1
    setTocList((prev) => [...prev, { level, title: tr('新章节标题', 'New Section'), page: newPage }])
  }

  const handleRemoveItem = (index: number) => {
    setTocList((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= tocList.length) return
    const updated = [...tocList]
    const temp = updated[index]
    updated[index] = updated[targetIdx]
    updated[targetIdx] = temp
    setTocList(updated)
  }

  const handleUpdateItem = (index: number, field: keyof TocItem, val: any) => {
    const updated = [...tocList]
    updated[index] = { ...updated[index], [field]: val }
    setTocList(updated)
  }

  const handleSaveToc = async () => {
    if (!activeTab) return

    setIsProcessing(true)
    setErrorMsg('')

    try {
      // 与其他编辑工具保持一致：写入工作副本并应用到当前标签，由用户通过 Ctrl+S / 另存为 决定落盘位置
      const tempPath = await window.electronAPI.getTempPdfPath('toc')
      const res = await window.electronAPI.pdfSetToc(activeTab.filePath, tempPath, tocList)
      if (res.success && res.outputPath) {
        await useDocumentStore.getState().applyModifiedPDF(res.outputPath)
      } else {
        setErrorMsg(res.error || tr('保存目录大纲失败', 'Failed to save table of contents'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('保存过程异常', 'An error occurred while saving'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl h-[75vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-indigo-400">
            <ListTree className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('编辑书签大纲目录', 'Edit Table of Contents')}</h3>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            aria-label={tr('关闭', 'Close')}
            title={tr('关闭', 'Close')}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 工具栏 */}
        <div className="px-5 py-2.5 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            {tr('总条目数:', 'Entries:')} <strong className="text-slate-200">{tocList.length}</strong>{' '}
            {tr('(可直接修改标题与目标页码)', '(edit titles and target pages inline)')}
          </span>
          <div className="flex space-x-2">
            <button
              onClick={() => handleAddItem(1)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tr('添加一级大纲', 'Add Level 1')}</span>
            </button>
            <button
              onClick={() => handleAddItem(2)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tr('添加二级子章节', 'Add Level 2')}</span>
            </button>
          </div>
        </div>

        {/* 目录列表 */}
        <div className="p-5 flex-1 overflow-y-auto space-y-2 text-xs">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-slate-400 space-x-2">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span>{tr('正在读取文档目录结构...', 'Reading table of contents...')}</span>
            </div>
          ) : tocList.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-500 space-y-2">
              <Bookmark className="w-8 h-8 opacity-40 text-indigo-400" />
              <p>
                {tr(
                  '当前文档暂无目录书签，点击上方“添加一级大纲”开始创建',
                  'This document has no bookmarks yet. Click "Add Level 1" above to start.'
                )}
              </p>
            </div>
          ) : (
            tocList.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center space-x-2 p-2 bg-slate-950/60 border border-slate-800 rounded-xl"
                style={{ paddingLeft: `${(item.level - 1) * 20 + 8}px` }}
              >
                <div className="flex items-center space-x-1 text-slate-500 font-mono text-[11px] shrink-0">
                  <span className="w-5 text-right">#{idx + 1}</span>
                  <select
                    value={item.level}
                    onChange={(e) => handleUpdateItem(idx, 'level', parseInt(e.target.value) || 1)}
                    aria-label={tr('大纲层级', 'Outline level')}
                    className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 text-[10px]"
                  >
                    <option value={1}>L1</option>
                    <option value={2}>L2</option>
                    <option value={3}>L3</option>
                  </select>
                </div>

                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => handleUpdateItem(idx, 'title', e.target.value)}
                  placeholder={tr('章节标题', 'Section title')}
                  aria-label={tr('章节标题', 'Section title')}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                />

                <div className="flex items-center space-x-1 shrink-0">
                  <span className="text-slate-500">{tr('跳转页:', 'Page:')}</span>
                  <input
                    type="number"
                    min={1}
                    max={activeTab?.pageCount || 9999}
                    value={item.page}
                    onChange={(e) => handleUpdateItem(idx, 'page', Math.max(1, parseInt(e.target.value) || 1))}
                    aria-label={tr('跳转页码', 'Target page')}
                    className="w-14 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-center text-slate-200 font-mono"
                  />
                </div>

                <div className="flex items-center space-x-0.5 shrink-0 pl-1">
                  <button
                    onClick={() => handleMoveItem(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20 hover:bg-slate-800 rounded"
                    title={tr('上移', 'Move up')}
                    aria-label={tr('上移', 'Move up')}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleMoveItem(idx, 'down')}
                    disabled={idx === tocList.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20 hover:bg-slate-800 rounded"
                    title={tr('下移', 'Move down')}
                    aria-label={tr('下移', 'Move down')}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemoveItem(idx)}
                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded ml-1"
                    title={tr('删除节点', 'Delete entry')}
                    aria-label={tr('删除节点', 'Delete entry')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            onClick={handleSaveToc}
            disabled={isProcessing || !activeTab}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{tr('保存写入中...', 'Saving...')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{tr('应用大纲到文档', 'Apply to Document')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
