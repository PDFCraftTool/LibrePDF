import React, { useState, useEffect } from 'react'
import { useDocumentStore, cleanIpcError } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import { X, Sparkles, ScanText, Cpu, ShieldCheck, AlertCircle, AlertTriangle } from 'lucide-react'

export const OCRDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [dpi, setDpi] = useState(200)
  const [isProcessing, setIsProcessing] = useState(false)
  const [pythonStatus, setPythonStatus] = useState<{ ready: boolean; engine?: string; error?: string } | null>(null)
  const [progress, setProgress] = useState<{ page: number; totalPages: number; percent: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (activeDialog === 'ocr') {
      window.electronAPI
        .pythonCheckEnv()
        .then(setPythonStatus)
        .catch((err) => setPythonStatus({ ready: false, error: cleanIpcError(err) }))
    }
  }, [activeDialog])

  // 订阅主进程推送的逐页识别进度
  useEffect(() => {
    if (activeDialog !== 'ocr') return
    return window.electronAPI.onOcrProgress((p) => setProgress(p))
  }, [activeDialog])

  if (activeDialog !== 'ocr' || !activeTab) return null

  const handleStartOCR = async () => {
    const defaultOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '_searchable_ocr.pdf')
    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: defaultOut,
      filters: [{ name: tr('PDF 文档', 'PDF documents'), extensions: ['pdf'] }]
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')
    setProgress({ page: 0, totalPages: activeTab.pageCount, percent: 0 })

    try {
      const res = await window.electronAPI.pythonOcrSandwich(activeTab.filePath, savePath, dpi)
      if (res.success && res.outputPath) {
        toast.success(
          tr('OCR 完成', 'OCR complete'),
          tr(`共识别 ${res.totalWords ?? 0} 个字符，已生成可搜索 PDF`, `Recognized ${res.totalWords ?? 0} characters; searchable PDF created`),
          res.outputPath
        )
        setActiveDialog('none')
        await openDocument(res.outputPath)
      } else {
        setErrorMsg(res.error || tr('OCR 处理失败', 'OCR failed'))
      }
    } catch (err: any) {
      setErrorMsg(cleanIpcError(err) || tr('执行异常', 'Unexpected error'))
    } finally {
      setIsProcessing(false)
      setProgress(null)
    }
  }

  const dpiOptions = [
    { val: 150, label: tr('标准 150 DPI', 'Standard 150 DPI'), hint: tr('速度快，适合大文档', 'Fast, good for large files') },
    { val: 200, label: tr('高清 200 DPI', 'High 200 DPI'), hint: tr('推荐，兼顾速度与准确度', 'Recommended balance') },
    { val: 300, label: tr('档案级 300 DPI', 'Archive 300 DPI'), hint: tr('小号文字、复杂印章', 'Small print, complex stamps') }
  ]

  const envNotReady = pythonStatus && !pythonStatus.ready

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" role="dialog" aria-modal="true" aria-labelledby="ocr-title">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2.5 text-rose-400">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <ScanText className="w-5 h-5" />
            </div>
            <div>
              <h3 id="ocr-title" className="font-bold text-sm text-slate-100">
                {tr('OCR 制作可搜索 PDF', 'OCR: make a searchable PDF')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {tr('本地离线识别，在原页面下方注入隐形文字层', 'Offline recognition that adds an invisible text layer under each page')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={tr('关闭', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex-1 space-y-4 text-xs">
          {/* 引擎状态 */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              <Cpu className={`w-5 h-5 shrink-0 ${envNotReady ? 'text-amber-400' : 'text-rose-400'}`} />
              <div className="min-w-0">
                <span className="font-semibold text-slate-200 block text-xs">
                  {!pythonStatus
                    ? tr('正在检测 Python 识别环境...', 'Checking the Python OCR environment...')
                    : pythonStatus.ready
                      ? tr('RapidOCR 离线引擎就绪', 'RapidOCR offline engine ready')
                      : tr('OCR 环境未就绪', 'OCR environment not ready')}
                </span>
                <span className="text-[10px] text-slate-400 block truncate" title={pythonStatus?.engine || pythonStatus?.error}>
                  {pythonStatus?.ready ? pythonStatus.engine : pythonStatus?.error || tr('本地 CPU 推理，不上传任何数据', 'Runs on your CPU; nothing is uploaded')}
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 shrink-0 rounded-full bg-emerald-950/80 border border-emerald-800 text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              {tr('离线', 'Offline')}
            </span>
          </div>

          {envNotReady && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/30 text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>{tr('需要 Python 3.9+ 及识别依赖，请在终端执行：', 'Python 3.9+ with OCR dependencies is required. Run in a terminal:')}</p>
                <code className="block font-mono text-[11px] bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 select-text">
                  pip install -r python/requirements.txt
                </code>
              </div>
            </div>
          )}

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-slate-300 leading-relaxed text-[11px] space-y-1.5">
            <p className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              <span>{tr('双层 PDF 是什么？', 'What is a two-layer PDF?')}</span>
            </p>
            <p className="text-slate-400">
              {tr(
                '页面外观（扫描图像、印章）完全保持不变，只在下方对齐嵌入一层看不见的文字，之后即可搜索、选中和复制文本。',
                'The page appearance (scans, stamps) stays exactly the same; an invisible, aligned text layer is added so you can search, select and copy text.'
              )}
            </p>
          </div>

          <div>
            <span className="block text-slate-300 mb-1.5 font-medium">{tr('识别精度', 'Recognition resolution')}</span>
            <div className="grid grid-cols-3 gap-2">
              {dpiOptions.map((item) => (
                <button
                  key={item.val}
                  onClick={() => setDpi(item.val)}
                  disabled={isProcessing}
                  aria-pressed={dpi === item.val}
                  className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center ${
                    dpi === item.val
                      ? 'bg-rose-950/80 border-rose-500 text-rose-200 font-semibold'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs">{item.label}</span>
                  <span className="text-[10px] opacity-75 mt-0.5">{item.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 实时进度条 */}
          {isProcessing && progress && (
            <div className="space-y-1.5" aria-live="polite">
              <div className="flex items-center justify-between text-[11px] text-rose-200">
                <span>
                  {progress.page === 0
                    ? tr('正在加载识别模型...', 'Loading the recognition model...')
                    : tr(`正在识别第 ${progress.page} / ${progress.totalPages} 页`, `Recognizing page ${progress.page} / ${progress.totalPages}`)}
                </span>
                <span className="font-mono">{progress.percent}%</span>
              </div>
              <div
                className="h-2 rounded-full bg-slate-800 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
              >
                <div
                  className={`h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-300 ${progress.page === 0 ? 'animate-pulse w-1/12' : ''}`}
                  style={progress.page === 0 ? undefined : { width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="p-2.5 rounded-xl bg-red-950/40 border border-red-900/60 text-red-300 flex items-start space-x-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span className="break-all select-text">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {tr(`当前文档：${activeTab.pageCount} 页`, `Document: ${activeTab.pageCount} page(s)`)}
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
              onClick={handleStartOCR}
              disabled={isProcessing || !!envNotReady}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 transition-all active:scale-95"
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{tr('识别中...', 'Recognizing...')}</span>
                </>
              ) : (
                <>
                  <ScanText className="w-3.5 h-3.5" />
                  <span>{tr('开始 OCR', 'Start OCR')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
