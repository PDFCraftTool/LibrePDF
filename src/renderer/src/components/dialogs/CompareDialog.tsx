import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { X, GitCompare, FileUp, AlertCircle, CheckCircle2, ArrowUpDown, Trash2, FileCheck2 } from 'lucide-react'
import { useTr } from '../../i18n'

export const CompareDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [fileA, setFileA] = useState<string>(activeTab ? activeTab.filePath : '')
  const [fileB, setFileB] = useState<string>('')
  const [dpi, setDpi] = useState<number>(150)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [resultMsg, setResultMsg] = useState('')
  const [isDragOverA, setIsDragOverA] = useState(false)
  const [isDragOverB, setIsDragOverB] = useState(false)

  if (activeDialog !== 'compare') return null

  const handleSelectFile = async (target: 'A' | 'B') => {
    const paths = await window.electronAPI.openFileDialog({
      multiSelections: false,
      filters: [{ name: tr('PDF 文档', 'PDF Documents'), extensions: ['pdf'] }]
    })
    if (paths && paths.length > 0) {
      if (target === 'A') setFileA(paths[0])
      else setFileB(paths[0])
    }
  }

  const handleSwapAB = () => {
    const temp = fileA
    setFileA(fileB)
    setFileB(temp)
  }

  const handleDropFile = (e: React.DragEvent, target: 'A' | 'B') => {
    e.preventDefault()
    if (target === 'A') setIsDragOverA(false)
    else setIsDragOverB(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Electron 32+ 已移除 File.path，需通过 preload 暴露的 webUtils.getPathForFile 获取真实路径
      const filePath = window.electronAPI.getDroppedFilePath(e.dataTransfer.files[0])
      if (filePath && filePath.toLowerCase().endsWith('.pdf')) {
        if (target === 'A') setFileA(filePath)
        else setFileB(filePath)
      } else {
        setErrorMsg(tr('请拖入有效的 .pdf 格式文件', 'Please drop a valid .pdf file'))
      }
    }
  }

  const handleRunCompare = async () => {
    if (!fileA || !fileB) {
      setErrorMsg(tr('请选择两份待比对的 PDF 文档', 'Please select two PDF documents to compare'))
      return
    }
    if (fileA === fileB) {
      setErrorMsg(tr('基准文档 A 与对比文档 B 不能为同一个文件', 'Document A and document B must be different files'))
      return
    }

    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: fileA.replace(/\.pdf$/i, '_comparison_report.pdf')
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')
    setResultMsg('')

    try {
      const res = await window.electronAPI.pythonComparePDFs(fileA, fileB, savePath, dpi)
      if (res.success && res.outputPath) {
        toast.success(
          tr('比对完成', 'Comparison complete'),
          tr(
            `共 ${res.totalPages} 页，在 ${res.diffCount} 个页面检测到差异，已高亮标红。`,
            `${res.totalPages} pages compared, differences found on ${res.diffCount} pages and highlighted in red.`
          ),
          res.outputPath
        )
        setActiveDialog('none')
        await openDocument(res.outputPath)
      } else {
        setErrorMsg(res.error || tr('比对执行失败', 'Comparison failed'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('比对过程发生异常', 'An error occurred during comparison'))
    } finally {
      setIsProcessing(false)
    }
  }

  const getFileName = (path: string) => {
    if (!path) return ''
    return path.split(/[/\\]/).pop() || path
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2.5 text-indigo-400">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">{tr('双文档差异比对', 'Compare PDFs')}</h3>
              <p className="text-[11px] text-slate-400">
                {tr('逐像素检测两份 PDF 的排版与文字改动，生成差异高亮报告', 'Detect layout and text changes between two PDFs pixel by pixel and generate a highlighted report')}
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

        <div className="p-5 flex-1 space-y-4 text-xs">
          {/* 文件 A 区域 */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOverA(true)
            }}
            onDragLeave={() => setIsDragOverA(false)}
            onDrop={(e) => handleDropFile(e, 'A')}
            className={`p-3 rounded-xl border transition-all ${
              isDragOverA
                ? 'bg-indigo-950/40 border-indigo-400'
                : 'bg-slate-950/50 border-slate-800/90 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center space-x-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-indigo-300 border border-indigo-500/30">
                  {tr('文件 A', 'File A')}
                </span>
                <span className="text-slate-200 font-medium">{tr('原始基准文档', 'Baseline')}</span>
              </div>
              {fileA && (
                <button
                  onClick={() => setFileA('')}
                  className="text-slate-500 hover:text-rose-400 transition-colors"
                  title={tr('清除', 'Clear')}
                  aria-label={tr('清除', 'Clear')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex space-x-2">
              <div
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 truncate font-mono text-[11px] flex items-center cursor-pointer"
                onClick={() => handleSelectFile('A')}
                title={fileA || tr('支持拖拽 PDF 文件至此或点击右侧选择', 'Drop a PDF here or click Browse')}
              >
                {fileA ? (
                  <span className="text-slate-200">{getFileName(fileA)}</span>
                ) : (
                  <span className="text-slate-500">{tr('点击选择或拖入基准 PDF 文件...', 'Click or drop the baseline PDF...')}</span>
                )}
              </div>
              <button
                onClick={() => handleSelectFile('A')}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0 flex items-center space-x-1 transition-colors"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>{tr('浏览', 'Browse')}</span>
              </button>
            </div>
          </div>

          {/* 快速对调 A / B 按钮 */}
          <div className="flex items-center justify-center -my-2 relative z-10">
            <button
              onClick={handleSwapAB}
              disabled={!fileA && !fileB}
              className="px-3 py-1 bg-slate-800 hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white text-[11px] font-medium flex items-center space-x-1 shadow-md transition-all active:scale-95"
              title={tr('对调基准文档与对比文档', 'Swap baseline and modified documents')}
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>{tr('对调 A / B', 'Swap A / B')}</span>
            </button>
          </div>

          {/* 文件 B 区域 */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOverB(true)
            }}
            onDragLeave={() => setIsDragOverB(false)}
            onDrop={(e) => handleDropFile(e, 'B')}
            className={`p-3 rounded-xl border transition-all ${
              isDragOverB
                ? 'bg-indigo-950/40 border-indigo-400'
                : 'bg-slate-950/50 border-slate-800/90 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center space-x-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/50">
                  {tr('文件 B', 'File B')}
                </span>
                <span className="text-slate-200 font-medium">{tr('新版对比文档', 'Modified')}</span>
              </div>
              {fileB && (
                <button
                  onClick={() => setFileB('')}
                  className="text-slate-500 hover:text-rose-400 transition-colors"
                  title={tr('清除', 'Clear')}
                  aria-label={tr('清除', 'Clear')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex space-x-2">
              <div
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 truncate font-mono text-[11px] flex items-center cursor-pointer"
                onClick={() => handleSelectFile('B')}
                title={fileB || tr('支持拖拽 PDF 文件至此或点击右侧选择', 'Drop a PDF here or click Browse')}
              >
                {fileB ? (
                  <span className="text-slate-200">{getFileName(fileB)}</span>
                ) : (
                  <span className="text-slate-500">{tr('点击选择或拖入新版 PDF 文件...', 'Click or drop the modified PDF...')}</span>
                )}
              </div>
              <button
                onClick={() => handleSelectFile('B')}
                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 flex items-center space-x-1 shadow transition-colors"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>{tr('浏览', 'Browse')}</span>
              </button>
            </div>
          </div>

          {/* 比对配置与精度 */}
          <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-300 font-medium block">{tr('渲染精度 (DPI)', 'Render resolution (DPI)')}</span>
              <span className="text-[10px] text-slate-500">{tr('精度越高，细小字符比对越精细，耗时略有增加', 'Higher DPI catches finer details but takes a bit longer')}</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setDpi(150)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  dpi === 150
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tr('标准 (150 DPI)', 'Standard (150 DPI)')}
              </button>
              <button
                onClick={() => setDpi(200)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  dpi === 200
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tr('高清 (200 DPI)', 'High (200 DPI)')}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/60 text-red-300 flex items-center space-x-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {resultMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-emerald-300 flex items-center space-x-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{resultMsg}</span>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            <FileCheck2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>{tr('报告会以红色高亮标记变动区域', 'Changed areas are highlighted in red in the report')}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveDialog('none')}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
            >
              {tr('取消', 'Cancel')}
            </button>
            <button
              onClick={handleRunCompare}
              disabled={isProcessing || !fileA || !fileB}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{tr('比对分析中...', 'Comparing...')}</span>
                </>
              ) : (
                <>
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>{tr('开始比对并输出报告', 'Compare & Export Report')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
