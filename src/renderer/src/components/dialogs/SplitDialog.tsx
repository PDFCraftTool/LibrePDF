import React, { useMemo, useState } from 'react'
import { useDocumentStore, cleanIpcError } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { X, Scissors, FolderOpen, AlertCircle } from 'lucide-react'
import { useTr } from '../../i18n'

type SplitMode = 'single' | 'every' | 'ranges'

/** 解析形如 "1-3, 5, 8-10" 的页码区间；返回 null 表示格式错误 */
const parseRanges = (input: string, pageCount: number): { start: number; end: number }[] | null => {
  const parts = input.split(/[,，;；\s]+/).filter(Boolean)
  if (parts.length === 0) return null
  const ranges: { start: number; end: number }[] = []
  for (const part of parts) {
    const m = part.match(/^(\d+)(?:\s*[-~–]\s*(\d+))?$/)
    if (!m) return null
    const a = parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : a
    const start = Math.min(a, b)
    const end = Math.max(a, b)
    if (start < 1 || end > pageCount) return null
    ranges.push({ start, end })
  }
  return ranges
}

export const SplitDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  const [mode, setMode] = useState<SplitMode>('ranges')
  const [rangeText, setRangeText] = useState('')
  const [everyN, setEveryN] = useState(2)
  const [outputDir, setOutputDir] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const pageCount = activeTab?.pageCount ?? 0
  const sourcePath = activeTab?.originalFilePath || activeTab?.filePath || ''
  const defaultDir = useMemo(() => {
    if (!sourcePath) return ''
    const base = sourcePath.replace(/\.pdf$/i, '')
    return `${base}_split`
  }, [sourcePath])

  const ranges = useMemo(() => {
    if (!pageCount) return null
    if (mode === 'single') {
      return Array.from({ length: pageCount }, (_, i) => ({ start: i + 1, end: i + 1 }))
    }
    if (mode === 'every') {
      const n = Math.max(1, Math.floor(everyN) || 1)
      const list: { start: number; end: number }[] = []
      for (let s = 1; s <= pageCount; s += n) list.push({ start: s, end: Math.min(pageCount, s + n - 1) })
      return list
    }
    return parseRanges(rangeText, pageCount)
  }, [mode, rangeText, everyN, pageCount])

  if (activeDialog !== 'split' || !activeTab) return null

  const rangeError = mode === 'ranges' && rangeText.trim() !== '' && !ranges
  const canSubmit = !!ranges && ranges.length > 0 && !isProcessing

  const handlePickDir = async () => {
    const dirs = await window.electronAPI.openFileDialog({ openDirectory: true })
    if (dirs?.[0]) setOutputDir(dirs[0])
  }

  const handleSplit = async () => {
    if (!ranges || ranges.length === 0) return
    const targetDir = outputDir || defaultDir
    setIsProcessing(true)
    try {
      const res = await window.electronAPI.splitPDF(activeTab.filePath, ranges, targetDir)
      if (res.success) {
        const count = res.pageCount ?? ranges.length
        toast.success(tr(`拆分完成，共生成 ${count} 个文件`, `Split complete: ${count} files created`), targetDir, targetDir)
        setActiveDialog('none')
      } else {
        toast.error(tr('拆分失败', 'Split failed'), res.error || res.message)
      }
    } catch (err: any) {
      toast.error(tr('拆分失败', 'Split failed'), cleanIpcError(err))
    } finally {
      setIsProcessing(false)
    }
  }

  const modeButton = (value: SplitMode, label: string, desc: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`p-2.5 rounded-xl border text-left transition-colors ${
        mode === value
          ? 'bg-emerald-500/10 border-emerald-500/60 text-emerald-200'
          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'
      }`}
    >
      <div className="font-semibold text-xs">{label}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{desc}</div>
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" role="dialog" aria-modal="true" aria-labelledby="split-dialog-title">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 id="split-dialog-title" className="font-bold text-sm text-slate-100">{tr('拆分 PDF', 'Split PDF')}</h3>
              <p className="text-[11px] text-slate-400">{activeTab.fileName} · {tr(`共 ${pageCount} 页`, `${pageCount} pages`)}</p>
            </div>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={tr('关闭', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-2">
            {modeButton('ranges', tr('自定义区间', 'Custom ranges'), tr('如 1-3, 5, 8-10', 'e.g. 1-3, 5, 8-10'))}
            {modeButton('every', tr('每 N 页', 'Every N pages'), tr('按固定页数分组', 'Fixed-size groups'))}
            {modeButton('single', tr('逐页拆分', 'Single pages'), tr(`生成 ${pageCount} 个文件`, `Creates ${pageCount} files`))}
          </div>

          {mode === 'ranges' && (
            <div className="space-y-1.5">
              <label htmlFor="split-ranges" className="text-slate-300 font-medium">{tr('页码区间', 'Page ranges')}</label>
              <input
                id="split-ranges"
                autoFocus
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSplit()}
                placeholder={tr(`例如：1-3, 4-${Math.max(4, pageCount)}`, `e.g. 1-3, 4-${Math.max(4, pageCount)}`)}
                className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none ${
                  rangeError ? 'border-rose-500/70' : 'border-slate-700 focus:border-emerald-500'
                }`}
              />
              <p className={rangeError ? 'text-rose-300' : 'text-slate-500'}>
                {rangeError
                  ? tr(`格式有误或页码超出 1-${pageCount} 范围`, `Invalid format or page outside 1-${pageCount}`)
                  : tr('每个区间生成一个文件，用逗号分隔', 'One file per range, separated by commas')}
              </p>
            </div>
          )}

          {mode === 'every' && (
            <div className="space-y-1.5">
              <label htmlFor="split-every" className="text-slate-300 font-medium">{tr('每个文件包含页数', 'Pages per file')}</label>
              <input
                id="split-every"
                type="number"
                min={1}
                max={pageCount}
                value={everyN}
                onChange={(e) => setEveryN(parseInt(e.target.value, 10) || 1)}
                className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {ranges && ranges.length > 0 && (
            <div className="rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2 text-slate-400">
              {tr('将生成 ', 'Will create ')}
              <span className="text-emerald-300 font-semibold">{ranges.length}</span>
              {tr(' 个文件：', ' files:')}
              <span className="font-mono text-slate-300 ml-1">
                {ranges.slice(0, 6).map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)).join(', ')}
                {ranges.length > 6 ? ' …' : ''}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">{tr('输出文件夹', 'Output folder')}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 truncate" title={outputDir || defaultDir}>
                {outputDir || defaultDir}
              </div>
              <button
                onClick={handlePickDir}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {tr('更改', 'Change')}
              </button>
            </div>
          </div>

          {activeTab.isModified && (
            <div className="flex items-start gap-2 text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{tr('将按当前编辑后的内容（含未保存修改）进行拆分。', 'The current edited content (including unsaved changes) will be split.')}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            onClick={handleSplit}
            disabled={!canSubmit}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{tr('正在拆分...', 'Splitting...')}</span>
              </>
            ) : (
              <>
                <Scissors className="w-3.5 h-3.5" />
                <span>{tr('开始拆分', 'Split')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
