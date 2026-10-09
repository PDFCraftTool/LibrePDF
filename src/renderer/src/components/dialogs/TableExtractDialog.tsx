import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, Table, FileSpreadsheet, Download, Copy, Check, Sparkles } from 'lucide-react'
import { useTr } from '../../i18n'

export const TableExtractDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId } = useDocumentStore()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [scope, setScope] = useState<'current' | 'all'>('current')
  const [isProcessing, setIsProcessing] = useState(false)
  const [markdownResult, setMarkdownResult] = useState('')
  const [tableCount, setTableCount] = useState<number | null>(null)
  const [excelPath, setExcelPath] = useState('')
  const [hasCopied, setHasCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (activeDialog !== 'tableExtract' || !activeTab) return null

  const handleExtract = async () => {
    const defaultOut = activeTab.filePath.replace(/\.pdf$/i, '_extracted_tables.xlsx')
    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: defaultOut,
      filters: [{ name: tr('Excel 工作簿 (*.xlsx)', 'Excel Workbook (*.xlsx)'), extensions: ['xlsx'] }]
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')
    setMarkdownResult('')
    setTableCount(null)

    const pages = scope === 'current' ? [activeTab.currentPage] : undefined

    try {
      const res = await window.electronAPI.pythonExtractTables(activeTab.filePath, savePath, pages)
      if (res.success) {
        setTableCount(res.tableCount ?? 0)
        setMarkdownResult(res.markdown || '')
        setExcelPath(res.outputPath || savePath)
      } else {
        setErrorMsg(res.error || tr('表格识别失败', 'Table detection failed'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('执行异常', 'Execution failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(markdownResult)
    setHasCopied(true)
    setTimeout(() => setHasCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('表格提取（Excel / Markdown）', 'Table Extraction (Excel / Markdown)')}</h3>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            aria-label={tr('关闭', 'Close')}
            title={tr('关闭', 'Close')}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-slate-400 block mb-1">{tr('提取范围', 'Scope')}</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setScope('current')}
                  className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    scope === 'current'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tr(`仅当前第 ${activeTab.currentPage} 页`, `Current page only (${activeTab.currentPage})`)}
                </button>
                <button
                  onClick={() => setScope('all')}
                  className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    scope === 'all'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tr(`全部 ${activeTab.pageCount} 页`, `All ${activeTab.pageCount} pages`)}
                </button>
              </div>
            </div>

            <button
              onClick={handleExtract}
              disabled={isProcessing}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold shadow-md transition-colors flex items-center space-x-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isProcessing ? tr('正在分析表格结构...', 'Analyzing table structure...') : tr('识别并导出 Excel', 'Detect & Export to Excel')}</span>
            </button>
          </div>

          {errorMsg && (
            <div className="text-rose-400 bg-rose-950/50 p-2.5 rounded-lg border border-rose-900/60">
              {errorMsg}
            </div>
          )}

          {tableCount !== null && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-emerald-300 font-medium">
                <span>{tr(`识别到 ${tableCount} 个表格`, `Found ${tableCount} table(s)`)}</span>
                {markdownResult && (
                  <button
                    onClick={handleCopyMarkdown}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-900/60 hover:bg-emerald-800 text-[11px] text-emerald-200"
                  >
                    {hasCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{hasCopied ? tr('已复制 Markdown', 'Markdown copied') : tr('复制 Markdown 表格', 'Copy Markdown tables')}</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                {tr('已生成 Excel 工作簿：', 'Excel workbook created: ')}{excelPath}
              </p>
            </div>
          )}

          {/* 表格预览区 */}
          <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 min-h-[220px] max-h-[380px] overflow-auto font-mono text-slate-300 whitespace-pre leading-relaxed select-text text-[11px]">
            {markdownResult || (
              <div className="text-slate-600 text-center py-16">
                {tr(
                  '点击右上角“识别并导出 Excel”，将使用深度学习模型解析无边框及跨行跨列表格，并生成带表头配色、斑马条纹和自适应列宽的 Excel 文件。',
                  'Click "Detect & Export to Excel" to parse borderless and merged-cell tables with a deep learning model and generate an Excel file with styled headers, zebra stripes and auto-fit columns.'
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
