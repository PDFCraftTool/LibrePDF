import React, { useState, useEffect } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, Layers, Plus, Trash2, ArrowUp, ArrowDown, FileUp, Sparkles, FileText } from 'lucide-react'
import { useTr } from '../../i18n'

export const MergeDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [fileList, setFileList] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)

  // 当弹窗打开时，若当前有打开文档且列表为空，自动将当前文档作为第 1 个待合并文件
  useEffect(() => {
    if (activeDialog === 'merge') {
      if (activeTab && fileList.length === 0) {
        setFileList([activeTab.filePath])
      }
    }
  }, [activeDialog, activeTab?.filePath])

  if (activeDialog !== 'merge') return null

  const handleAddFiles = async () => {
    const paths = await window.electronAPI.openFileDialog({
      multiSelections: true,
      filters: [{ name: tr('PDF 文档', 'PDF Document'), extensions: ['pdf'] }]
    })
    if (paths && paths.length > 0) {
      setFileList((prev) => {
        const set = new Set(prev)
        paths.forEach((p) => set.add(p))
        return Array.from(set)
      })
    }
  }

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedPaths: string[] = []
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        // Electron 32+ 已移除 File.path，需通过 preload 暴露的 webUtils.getPathForFile 获取真实路径
        const filePath = window.electronAPI.getDroppedFilePath(e.dataTransfer.files[i])
        if (filePath && filePath.toLowerCase().endsWith('.pdf')) {
          droppedPaths.push(filePath)
        }
      }
      if (droppedPaths.length > 0) {
        setFileList((prev) => {
          const set = new Set(prev)
          droppedPaths.forEach((p) => set.add(p))
          return Array.from(set)
        })
      } else {
        setErrorMsg(tr('请拖入有效的 .pdf 文件', 'Please drop valid .pdf files'))
      }
    }
  }

  const handleRemove = (index: number) => {
    setFileList((prev) => prev.filter((_, i) => i !== index))
  }

  const handleClearAll = () => {
    setFileList([])
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1
    if (newIdx < 0 || newIdx >= fileList.length) return
    const updated = [...fileList]
    const temp = updated[index]
    updated[index] = updated[newIdx]
    updated[newIdx] = temp
    setFileList(updated)
  }

  const handleExecuteMerge = async () => {
    if (fileList.length < 2) {
      setErrorMsg(tr('请至少选择 2 个 PDF 文件进行合并', 'Please select at least 2 PDF files to merge'))
      return
    }

    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: 'merged_document.pdf'
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')

    try {
      const res = await window.electronAPI.mergePDFs(fileList, savePath)
      if (res.success && res.outputPath) {
        await openDocument(res.outputPath)
        setActiveDialog('none')
      } else {
        setErrorMsg(res.message || tr('合并失败', 'Merge failed'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('合并操作异常', 'An error occurred while merging'))
    } finally {
      setIsProcessing(false)
    }
  }

  const getFileName = (path: string) => path.split(/[/\\]/).pop() || path

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2.5 text-blue-400">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">{tr('多文件合并', 'Merge PDFs')}</h3>
              <p className="text-[11px] text-slate-400">
                {tr(
                  '支持拖拽多文件、调整拼接顺序并无损合并',
                  'Drag in multiple files, reorder them and merge without quality loss'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            aria-label={tr('关闭', 'Close')}
            title={tr('关闭', 'Close')}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体内容 */}
        <div className="p-5 flex-1 space-y-3.5 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-slate-300 font-medium">{tr('待合并文件清单', 'Files to merge')}</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-blue-400 font-mono text-[10px] font-bold">
                {fileList.length}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {fileList.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-slate-400 hover:text-rose-400 text-[11px] transition-colors"
                >
                  {tr('清空列表', 'Clear list')}
                </button>
              )}
              <button
                onClick={handleAddFiles}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{tr('添加文件', 'Add Files')}</span>
              </button>
            </div>
          </div>

          {/* 拖拽释放与文件列表 */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDropFiles}
            className={`min-h-56 max-h-64 overflow-y-auto space-y-1.5 p-2 rounded-xl border transition-all ${
              isDragOver
                ? 'bg-blue-950/30 border-blue-400 ring-2 ring-blue-500/20'
                : 'bg-slate-950/60 border-slate-800'
            }`}
          >
            {fileList.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-500 space-y-2 border-2 border-dashed border-slate-800/80 rounded-lg">
                <FileUp className="w-8 h-8 text-slate-600" />
                <p className="text-xs">{tr('将多个 PDF 文档直接拖入此处释放', 'Drop multiple PDF files here')}</p>
                <p className="text-[10px] text-slate-600">
                  {tr('或点击右上角“添加文件”按钮从磁盘选取', 'or click "Add Files" above to browse')}
                </p>
              </div>
            ) : (
              fileList.map((filePath, idx) => (
                <div
                  key={`${filePath}-${idx}`}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 text-slate-200 hover:border-slate-700 transition-colors group"
                >
                  <div className="flex items-center space-x-2.5 flex-1 min-w-0 mr-3">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono flex items-center justify-center font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <FileText className="w-4 h-4 text-blue-400/80 shrink-0" />
                    <span
                      className="truncate font-mono text-[11px] text-slate-200"
                      title={filePath}
                    >
                      {getFileName(filePath)}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-slate-800 disabled:opacity-20 text-slate-400 hover:text-slate-200 transition-colors"
                      title={tr('上移', 'Move up')}
                      aria-label={tr('上移', 'Move up')}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === fileList.length - 1}
                      className="p-1 rounded hover:bg-slate-800 disabled:opacity-20 text-slate-400 hover:text-slate-200 transition-colors"
                      title={tr('下移', 'Move down')}
                      aria-label={tr('下移', 'Move down')}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemove(idx)}
                      className="p-1 rounded hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 transition-colors ml-1"
                      title={tr('移除', 'Remove')}
                      aria-label={tr('移除', 'Remove')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {errorMsg && (
            <div className="text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded-xl border border-rose-900/60 flex items-center space-x-2">
              <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {tr('合并后保留原文档的矢量文本与图形', 'Vector text and graphics are preserved')}
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveDialog('none')}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
            >
              {tr('取消', 'Cancel')}
            </button>
            <button
              onClick={handleExecuteMerge}
              disabled={isProcessing || fileList.length < 2}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all active:scale-95"
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{tr('正在合并文档...', 'Merging...')}</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5" />
                  <span>{tr('合并并打开', 'Merge & Open')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
