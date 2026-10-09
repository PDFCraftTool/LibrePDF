import React, { useState } from 'react'
import { useDocumentStore, cleanIpcError } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import type { CompressLevel } from '../../../../shared/types'
import { X, Minimize2, Wrench, Layers2, FileUp, CheckCircle2, AlertCircle } from 'lucide-react'

const formatSize = (bytes?: number) => {
  if (!bytes && bytes !== 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export const CompressRepairOverlayDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  // 从 overlay 入口进入时默认选中“叠加”页签（弹窗每次打开都会重新挂载，初始值即可生效）
  const [activeTabMode, setActiveTabMode] = useState<'compress' | 'repair' | 'overlay'>(() =>
    activeDialog === 'overlay' ? 'overlay' : 'compress'
  )
  const [level, setLevel] = useState<CompressLevel>('medium')
  const [backgroundPdf, setBackgroundPdf] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (activeDialog !== 'compressRepair' && activeDialog !== 'overlay') return null

  const handleSelectBackground = async () => {
    const paths = await window.electronAPI.openFileDialog({
      multiSelections: false,
      filters: [{ name: tr('PDF 文档', 'PDF documents'), extensions: ['pdf'] }]
    })
    if (paths && paths.length > 0) {
      setBackgroundPdf(paths[0])
    }
  }

  const handleExecute = async () => {
    if (!activeTab) {
      setErrorMsg(tr('请先打开待处理的 PDF 文档', 'Please open a PDF document first'))
      return
    }
    if (activeTabMode === 'overlay' && !backgroundPdf) {
      setErrorMsg(tr('请选择作为底图背景模板的 PDF 文件', 'Please choose a background template PDF'))
      return
    }

    setIsProcessing(true)
    setErrorMsg('')

    try {
      const tempPath = await window.electronAPI.getTempPdfPath(activeTabMode)
      const apply = useDocumentStore.getState().applyModifiedPDF

      if (activeTabMode === 'compress') {
        const res = await window.electronAPI.pdfCompress(activeTab.filePath, tempPath, level)
        if (!res.success || !res.outputPath) {
          setErrorMsg(res.error || res.message || tr('压缩失败', 'Compression failed'))
          return
        }
        if (res.optimized === false) {
          // 体积没有继续减小：保留原文档不做改动
          toast.info(tr('文档已是最优体积', 'Already optimally compressed'), tr('压缩后没有变小，文档保持不变。', 'The result was not smaller, so the document was left unchanged.'))
          setActiveDialog('none')
          return
        }
        await apply(res.outputPath, { silent: true })
        toast.success(
          res.ratio !== undefined
            ? tr(`体积减少 ${res.ratio}%`, `Size reduced by ${res.ratio}%`)
            : tr('压缩完成', 'Compressed'),
          res.originalSize !== undefined
            ? `${formatSize(res.originalSize)} → ${formatSize(res.compressedSize)} · ${tr('按 Ctrl+S 保存', 'Press Ctrl+S to save')}`
            : res.message
        )
      } else if (activeTabMode === 'repair') {
        const res = await window.electronAPI.pdfRepair(activeTab.filePath, tempPath)
        if (!res.success || !res.outputPath) {
          setErrorMsg(res.error || res.message || tr('修复失败', 'Repair failed'))
          return
        }
        await apply(res.outputPath, { silent: true })
        toast.success(
          res.wasDamaged ? tr('已修复损坏的文档结构', 'Damaged structure repaired') : tr('结构检查完成', 'Structure check complete'),
          res.badPages?.length
            ? tr(`第 ${res.badPages.join(', ')} 页内容可能无法完全恢复`, `Page(s) ${res.badPages.join(', ')} may not be fully recoverable`)
            : res.wasDamaged === false
              ? tr('未发现结构损坏，已重新整理对象并清理冗余', 'No damage found; objects were rewritten and cleaned up')
              : undefined
        )
      } else {
        const res = await window.electronAPI.pdfOverlay(activeTab.filePath, backgroundPdf, tempPath)
        if (!res.success || !res.outputPath) {
          setErrorMsg(res.error || res.message || tr('叠加失败', 'Overlay failed'))
          return
        }
        await apply(res.outputPath)
      }
    } catch (err: any) {
      setErrorMsg(cleanIpcError(err) || tr('执行过程出现异常', 'Unexpected error'))
    } finally {
      setIsProcessing(false)
    }
  }

  const tabButton = (mode: 'compress' | 'repair' | 'overlay', Icon: React.ElementType, label: string, activeClass: string) => (
    <button
      onClick={() => setActiveTabMode(mode)}
      aria-pressed={activeTabMode === mode}
      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
        activeTabMode === mode ? `${activeClass} text-white font-medium` : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  )

  const levelOptions: { value: CompressLevel; label: string; hint: string }[] = [
    { value: 'low', label: tr('轻度', 'Light'), hint: tr('220 DPI · 画质优先', '220 DPI · best quality') },
    { value: 'medium', label: tr('标准', 'Balanced'), hint: tr('150 DPI · 推荐', '150 DPI · recommended') },
    { value: 'high', label: tr('极限', 'Maximum'), hint: tr('96 DPI · 体积优先', '96 DPI · smallest file') }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* 顶部标签切换 */}
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex space-x-1">
            {tabButton('compress', Minimize2, tr('体积压缩', 'Compress'), 'bg-amber-600')}
            {tabButton('repair', Wrench, tr('结构修复', 'Repair'), 'bg-blue-600')}
            {tabButton('overlay', Layers2, tr('底图叠加', 'Overlay'), 'bg-purple-600')}
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={tr('关闭', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体说明与配置 */}
        <div className="p-5 flex-1 space-y-4 text-xs">
          {activeTabMode === 'compress' && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-xl space-y-1">
                <span className="font-semibold text-amber-300">{tr('PDF 深度压缩', 'Compress PDF')}</span>
                <p className="text-slate-400">
                  {tr(
                    '对高分辨率图片降采样并重新编码，字体子集化，去除重复与孤立对象并压缩数据流。若结果没有变小，会保留原文档。',
                    'Downsamples and re-encodes high-resolution images, subsets fonts, removes duplicate/orphaned objects and compresses streams. If the result is not smaller, the original is kept.'
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-slate-300 font-medium">{tr('压缩强度', 'Compression level')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {levelOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setLevel(opt.value)}
                      aria-pressed={level === opt.value}
                      className={`p-2.5 rounded-xl border text-left transition-colors ${
                        level === opt.value
                          ? 'bg-amber-500/10 border-amber-500/60 text-amber-200'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-semibold">{opt.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-slate-300">
                {tr('当前文档：', 'Document: ')}
                <span className="font-mono text-amber-400">{activeTab?.fileName}</span>
              </div>
            </div>
          )}

          {activeTabMode === 'repair' && (
            <div className="space-y-3">
              <div className="p-3 bg-blue-950/20 border border-blue-900/40 rounded-xl space-y-1">
                <span className="font-semibold text-blue-300">{tr('PDF 结构修复', 'Repair PDF')}</span>
                <p className="text-slate-400">
                  {tr(
                    '使用 MuPDF 高容错解析重建损坏的交叉引用表与 Trailer，逐页检查可读性并重新写出干净的文件结构。',
                    'Rebuilds damaged cross-reference tables and trailers with MuPDF’s fault-tolerant parser, checks each page and rewrites a clean file structure.'
                  )}
                </p>
              </div>
              <div className="text-slate-300">
                {tr('当前文档：', 'Document: ')}
                <span className="font-mono text-blue-400">{activeTab?.fileName}</span>
              </div>
            </div>
          )}

          {activeTabMode === 'overlay' && (
            <div className="space-y-3">
              <div className="p-3 bg-purple-950/20 border border-purple-900/40 rounded-xl space-y-1">
                <span className="font-semibold text-purple-300">{tr('图层叠加', 'Overlay PDFs')}</span>
                <p className="text-slate-400">
                  {tr(
                    '将当前文档覆盖在指定的背景模板之上（如红头文件底稿、信纸模板），逐页合成一份新文档。',
                    'Places the current document on top of a background template (letterhead, stationery, etc.), page by page.'
                  )}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium" htmlFor="overlay-bg">
                  {tr('背景模板 PDF', 'Background template PDF')}
                </label>
                <div className="flex space-x-2">
                  <input
                    id="overlay-bg"
                    type="text"
                    readOnly
                    value={backgroundPdf}
                    placeholder={tr('点击右侧按钮选择模板', 'Click Browse to choose a template')}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 truncate focus:outline-none font-mono text-[11px]"
                  />
                  <button
                    onClick={handleSelectBackground}
                    className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white shrink-0 flex items-center space-x-1"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span>{tr('浏览', 'Browse')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="p-2.5 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 flex items-center space-x-2">
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
            onClick={handleExecute}
            disabled={isProcessing || !activeTab}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{tr('处理中...', 'Processing...')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{tr('开始处理', 'Run')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
