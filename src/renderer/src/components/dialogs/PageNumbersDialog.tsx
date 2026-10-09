import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, Hash, Eye, CheckCircle2, AlertCircle } from 'lucide-react'
import { useTr } from '../../i18n'

export const PageNumbersDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [format, setFormat] = useState('Page {page} of {total}')
  const [position, setPosition] = useState<
    'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left'
  >('bottom-center')
  const [startPage, setStartPage] = useState(1)
  const [fontSize, setFontSize] = useState(10)
  const [skipFirstPage, setSkipFirstPage] = useState(false)
  const [color, setColor] = useState('#475569') // 经典石板深灰
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (activeDialog !== 'pageNumbers') return null

  const presetFormats = [
    'Page {page} of {total}',
    '{page} / {total}',
    '- {page} -',
    '{page}',
    'P. {page}'
  ]

  const colorPresets = [
    { name: tr('石板灰', 'Slate'), hex: '#475569' },
    { name: tr('炭黑', 'Charcoal'), hex: '#0F172A' },
    { name: tr('银灰', 'Silver'), hex: '#94A3B8' },
    { name: tr('科技蓝', 'Blue'), hex: '#2563EB' }
  ]

  const handleApply = async () => {
    if (!activeTab) {
      setErrorMsg(tr('请先打开一份 PDF 文档', 'Please open a PDF document first'))
      return
    }

    setIsProcessing(true)
    setErrorMsg('')

    try {
      const tempPath = await window.electronAPI.getTempPdfPath('numbered')
      const res = await window.electronAPI.pdfAddPageNumbers(
        activeTab.filePath,
        {
          format,
          position,
          startPage,
          fontSize,
          color,
          skipFirstPage
        } as any,
        tempPath
      )

      if (res.success && res.outputPath) {
        await useDocumentStore.getState().applyModifiedPDF(res.outputPath)
      } else {
        setErrorMsg(res.message || tr('添加页码失败', 'Failed to add page numbers'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('操作异常', 'Operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  // 预览示例文本
  const totalPages = activeTab?.pageCount || 10
  const previewText = format
    .replace('{page}', String(startPage))
    .replace('{total}', String(skipFirstPage ? totalPages - 1 : totalPages))

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2.5 text-cyan-400">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">{tr('添加页码', 'Add Page Numbers')}</h3>
              <p className="text-[11px] text-slate-400">
                {tr('支持多种页码格式、实时预览与跳过封面首页', 'Multiple formats, live preview and an option to skip the cover page')}
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

        {/* 主体分栏 */}
        <div className="p-5 flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 text-xs">
          {/* 左侧控制参数 7 列 */}
          <div className="md:col-span-7 space-y-3.5">
            {/* 模板输入与预设 */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium block">{tr('页码格式模板', 'Format template')}</label>
              <input
                type="text"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {presetFormats.map((p) => (
                  <button
                    key={p}
                    onClick={() => setFormat(p)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* 方位选择 */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium block">{tr('放置位置', 'Position')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'top-left', label: tr('顶部居左', 'Top left') },
                  { id: 'top-center', label: tr('顶部居中', 'Top center') },
                  { id: 'top-right', label: tr('顶部居右', 'Top right') },
                  { id: 'bottom-left', label: tr('底部居左', 'Bottom left') },
                  { id: 'bottom-center', label: tr('底部居中 (常用)', 'Bottom center (common)') },
                  { id: 'bottom-right', label: tr('底部居右', 'Bottom right') }
                ].map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() => setPosition(pos.id as any)}
                    className={`py-1.5 rounded-lg border text-center transition-all ${
                      position === pos.id
                        ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200 font-medium shadow-sm'
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 颜色与跳过首页 */}
            <div className="flex items-center justify-between bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80">
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-400 text-[11px] mr-1">{tr('颜色:', 'Color:')}</span>
                {colorPresets.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setColor(c.hex)}
                    className={`w-5 h-5 rounded-full border transition-all ${
                      color === c.hex ? 'border-cyan-400 scale-110 ring-1 ring-cyan-400' : 'border-slate-700'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    aria-label={c.name}
                  />
                ))}
              </div>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipFirstPage}
                  onChange={(e) => setSkipFirstPage(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-600 focus:ring-0"
                />
                <span className="text-slate-300 text-[11px]">{tr('跳过封面首页 (不印页码)', 'Skip cover page (no number)')}</span>
              </label>
            </div>

            {/* 起始页与字号 */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-slate-400">{tr('起始页码:', 'Start number:')}</label>
                <input
                  type="number"
                  min={1}
                  value={startPage}
                  onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400">{tr('字号大小 (pt):', 'Font size (pt):')}</label>
                <input
                  type="number"
                  min={6}
                  max={24}
                  value={fontSize}
                  onChange={(e) => setFontSize(Math.max(6, parseInt(e.target.value) || 10))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-900/60 text-red-300 flex items-center space-x-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* 右侧白纸微缩画框实时示意 5 列 */}
          <div className="md:col-span-5 flex flex-col items-center justify-center bg-slate-950/80 border border-slate-800 rounded-xl p-3 relative overflow-hidden">
            <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-2 self-start">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span>{tr('页码位置实时预览', 'Live position preview')}</span>
            </div>

            {/* A4 白纸 */}
            <div className="w-44 h-60 bg-white rounded-lg shadow-lg relative overflow-hidden flex flex-col p-3 select-none border border-slate-300">
              {/* 模拟文本段落线条 */}
              <div className="w-full space-y-1.5 opacity-20 pointer-events-none mt-2">
                <div className="h-2 bg-slate-800 rounded w-1/2 mb-2" />
                <div className="h-1.5 bg-slate-700 rounded w-full" />
                <div className="h-1.5 bg-slate-700 rounded w-11/12" />
                <div className="h-1.5 bg-slate-700 rounded w-4/5" />
                <div className="h-1.5 bg-slate-700 rounded w-full mt-3" />
                <div className="h-1.5 bg-slate-700 rounded w-3/4" />
                <div className="h-1.5 bg-slate-700 rounded w-5/6" />
                <div className="h-1.5 bg-slate-700 rounded w-2/3 mt-3" />
              </div>

              {/* 实时页码定位标 */}
              <div
                className={`absolute px-2 py-0.5 rounded font-mono text-[9px] font-semibold transition-all ${
                  position === 'top-left'
                    ? 'top-2 left-2'
                    : position === 'top-center'
                    ? 'top-2 left-1/2 -translate-x-1/2'
                    : position === 'top-right'
                    ? 'top-2 right-2'
                    : position === 'bottom-left'
                    ? 'bottom-2 left-2'
                    : position === 'bottom-right'
                    ? 'bottom-2 right-2'
                    : 'bottom-2 left-1/2 -translate-x-1/2'
                }`}
                style={{ color: color }}
              >
                {previewText}
              </div>
            </div>

            <span className="text-[10px] text-slate-500 mt-2">
              {tr(`当前文档共 ${totalPages} 页`, `${totalPages} pages in document`)}{' '}
              {skipFirstPage ? tr('(首页封面已跳过)', '(cover page skipped)') : ''}
            </span>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={isProcessing || !activeTab}
            className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all active:scale-95"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{tr('正在添加...', 'Adding...')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{tr('添加页码', 'Add Page Numbers')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
