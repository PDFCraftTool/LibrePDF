import React, { useState, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useDocumentStore, cleanIpcError } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import { X, FolderSync, Play, Square, Terminal, FolderOpen } from 'lucide-react'

type HotFolderAction = 'ocr_sandwich' | 'watermark' | 'extract_tables' | 'extract_text'

/**
 * 热文件夹日志：在模块级别订阅一次，弹窗关闭期间产生的日志也会被保留（最多 500 条）
 */
const useHotFolderLogs = create<{ logs: string[]; clear: () => void }>((set) => ({
  logs: [],
  clear: () => set({ logs: [] })
}))
if (typeof window !== 'undefined' && window.electronAPI?.onHotFolderLog) {
  window.electronAPI.onHotFolderLog((log) => {
    useHotFolderLogs.setState((s) => ({ logs: [...s.logs.slice(-499), log] }))
  })
}

export const HotFolderDialog: React.FC = () => {
  const { activeDialog, setActiveDialog } = useDocumentStore()
  const tr = useTr()
  const [inputDir, setInputDir] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [action, setAction] = useState<HotFolderAction>('ocr_sandwich')
  const [watermarkText, setWatermarkText] = useState(() => tr('内部归档', 'ARCHIVED'))
  const [isRunning, setIsRunning] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const { logs, clear } = useHotFolderLogs()
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeDialog !== 'hotfolder') return
    let cancelled = false
    ;(async () => {
      try {
        const res = await window.electronAPI.hotFolderGetStatus()
        if (cancelled) return
        setIsRunning(res.isRunning)
        if (res.config) {
          setInputDir(res.config.inputDir)
          setOutputDir(res.config.outputDir)
          setAction(res.config.action)
          if (res.config.watermarkText) setWatermarkText(res.config.watermarkText)
          return
        }
        // 默认放在“文档”目录下，避免写死 D:\ 之类在其他电脑上不存在的路径
        const docs = await window.electronAPI.getSystemPath('documents')
        if (cancelled) return
        const sep = docs.includes('\\') ? '\\' : '/'
        setInputDir(`${docs}${sep}PDFOpen HotFolder${sep}input`)
        setOutputDir(`${docs}${sep}PDFOpen HotFolder${sep}output`)
      } catch {
        // 获取失败时保持为空，由用户选择
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeDialog])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [logs.length])

  if (activeDialog !== 'hotfolder') return null

  const pickDir = async (setter: (v: string) => void) => {
    const dirs = await window.electronAPI.openFileDialog({ openDirectory: true })
    if (dirs?.[0]) setter(dirs[0])
  }

  const handleStart = async () => {
    if (!inputDir.trim() || !outputDir.trim()) {
      toast.error(tr('请先设置输入与输出目录', 'Please set both the input and output folders'))
      return
    }
    if (inputDir.trim() === outputDir.trim()) {
      toast.error(tr('输入与输出目录不能相同', 'Input and output folders must be different'))
      return
    }
    if (action === 'watermark' && !watermarkText.trim()) {
      toast.error(tr('请输入水印文字', 'Please enter the watermark text'))
      return
    }
    setIsBusy(true)
    try {
      const res = await window.electronAPI.hotFolderStart({
        inputDir: inputDir.trim(),
        outputDir: outputDir.trim(),
        action,
        watermarkText: watermarkText.trim(),
        isRunning: true
      })
      if (res.success) {
        setIsRunning(true)
        toast.success(tr('热文件夹监听已启动', 'Hot folder watching started'), inputDir)
      } else {
        toast.error(tr('启动监听失败', 'Failed to start watching'), res.message)
      }
    } catch (err) {
      toast.error(tr('启动监听失败', 'Failed to start watching'), cleanIpcError(err))
    } finally {
      setIsBusy(false)
    }
  }

  const handleStop = async () => {
    setIsBusy(true)
    try {
      await window.electronAPI.hotFolderStop()
      setIsRunning(false)
    } finally {
      setIsBusy(false)
    }
  }

  const actions: { id: HotFolderAction; label: string }[] = [
    { id: 'ocr_sandwich', label: tr('🔍 OCR 生成可搜索 PDF', '🔍 OCR to searchable PDF') },
    { id: 'extract_tables', label: tr('📊 提取表格为 Excel', '📊 Extract tables to Excel') },
    { id: 'watermark', label: tr('💧 平铺文字水印', '💧 Tiled text watermark') },
    { id: 'extract_text', label: tr('⚡ 提取版面文本 (.txt)', '⚡ Extract layout text (.txt)') }
  ]

  const dirField = (id: string, label: string, value: string, setter: (v: string) => void) => (
    <div>
      <label htmlFor={id} className="block text-slate-300 mb-1 font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={value}
          disabled={isRunning}
          onChange={(e) => setter(e.target.value)}
          className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <button
          onClick={() => pickDir(setter)}
          disabled={isRunning}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 disabled:opacity-50 transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {tr('浏览', 'Browse')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" role="dialog" aria-modal="true" aria-labelledby="hotfolder-title">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-cyan-400">
            <FolderSync className="w-5 h-5" />
            <h3 id="hotfolder-title" className="font-bold text-sm text-slate-100">
              {tr('热文件夹自动处理', 'Hot Folder Automation')}
            </h3>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={tr('关闭', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          <p className="text-slate-400 text-[11px] leading-relaxed">
            {tr(
              '指定一个监听目录。扫描仪、下载或手动放入新的 PDF 后，会在后台自动执行所选操作，并把结果保存到输出目录。关闭此窗口后监听仍会继续。',
              'Choose a folder to watch. New PDFs dropped into it (by a scanner, a download or by hand) are processed automatically in the background and the results are saved to the output folder. Watching continues after you close this window.'
            )}
          </p>

          <div className="space-y-3">
            {dirField('hf-input', tr('监听目录', 'Watched folder'), inputDir, setInputDir)}
            {dirField('hf-output', tr('输出目录', 'Output folder'), outputDir, setOutputDir)}

            <div>
              <span className="block text-slate-300 mb-1.5 font-medium">{tr('自动执行的操作', 'Action to run')}</span>
              <div className="grid grid-cols-2 gap-2">
                {actions.map((item) => (
                  <button
                    key={item.id}
                    disabled={isRunning}
                    onClick={() => setAction(item.id)}
                    aria-pressed={action === item.id}
                    className={`p-2 rounded-lg border text-left font-medium transition-colors disabled:opacity-60 ${
                      action === item.id
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {action === 'watermark' && (
              <div>
                <label htmlFor="hf-wm" className="block text-slate-300 mb-1 font-medium">
                  {tr('水印文字', 'Watermark text')}
                </label>
                <input
                  id="hf-wm"
                  type="text"
                  value={watermarkText}
                  disabled={isRunning}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                />
              </div>
            )}
          </div>

          {/* 实时日志 */}
          <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/60 pb-1">
              <span className="flex items-center gap-1 font-mono">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                {tr('运行日志', 'Activity log')}
              </span>
              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button onClick={clear} className="text-[10px] text-slate-500 hover:text-slate-300">
                    {tr('清空', 'Clear')}
                  </button>
                )}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isRunning ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isRunning ? tr('运行中 · 每 3 秒扫描', 'Running · every 3 s') : tr('已停止', 'Stopped')}
                </span>
              </div>
            </div>
            <div className="max-h-36 overflow-y-auto font-mono text-[10px] space-y-1 text-slate-300 select-text" role="log" aria-live="polite">
              {logs.length === 0 ? (
                <div className="text-slate-600 py-4 text-center">
                  {tr('暂无日志，点击“开始监听”启动', 'No activity yet. Click “Start watching” to begin.')}
                </div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className={l.includes('❌') ? 'text-rose-300' : l.includes('✅') ? 'text-emerald-300' : 'text-slate-300'}>
                    {l}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            {tr('关闭', 'Close')}
          </button>

          {isRunning ? (
            <button
              onClick={handleStop}
              disabled={isBusy}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{tr('停止监听', 'Stop watching')}</span>
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={isBusy}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{tr('开始监听', 'Start watching')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
