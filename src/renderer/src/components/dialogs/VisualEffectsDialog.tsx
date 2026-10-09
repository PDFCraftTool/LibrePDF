import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import {
  X,
  ScanLine,
  Compass,
  FileMinus2,
  Contrast,
  AlertCircle,
  Sliders,
  Check
} from 'lucide-react'

export const VisualEffectsDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  // 扫描件效果参数
  const [scannerNoise, setScannerNoise] = useState(15)
  const [scannerAngle, setScannerAngle] = useState(0.4)
  const [scannerDpi, setScannerDpi] = useState(200)

  // 灰度反色参数
  const [colorMode, setColorMode] = useState<'grayscale' | 'invert'>('grayscale')

  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [resultMsg, setResultMsg] = useState('')

  const isScanner = activeDialog === 'scanner'
  const isDeskew = activeDialog === 'deskew'
  const isRemoveBlank = activeDialog === 'removeBlank'
  const isGrayscale = activeDialog === 'grayscale'

  if (!activeTab || (!isScanner && !isDeskew && !isRemoveBlank && !isGrayscale)) {
    return null
  }

  const handleExecute = async () => {
    setIsProcessing(true)
    setErrorMsg('')
    setResultMsg('')

    try {
      const tempPath = await window.electronAPI.getTempPdfPath('effect')
      let res: any

      if (isScanner) {
        // 噪点与倾斜角此前只在界面上可调，并未传给侧车
        res = await window.electronAPI.pythonScannerEffect(activeTab.filePath, tempPath, scannerDpi, scannerNoise, scannerAngle)
      } else if (isDeskew) {
        res = await window.electronAPI.pythonAutoDeskew(activeTab.filePath, tempPath)
      } else if (isRemoveBlank) {
        res = await window.electronAPI.pythonRemoveBlankPages(activeTab.filePath, tempPath)
      } else if (isGrayscale) {
        res = await window.electronAPI.pythonGrayscaleInvert(activeTab.filePath, tempPath, colorMode)
      }

      if (res?.success && res.outputPath) {
        if (isRemoveBlank) {
          const removed: number[] = res.removedPages || []
          if (removed.length === 0) {
            toast.info(tr('未检测到空白页', 'No blank pages found'), tr('文档保持不变', 'The document is unchanged'))
            setActiveDialog('none')
            return
          }
          await useDocumentStore.getState().applyModifiedPDF(res.outputPath, { silent: true })
          toast.success(
            tr(`已删除 ${removed.length} 个空白页`, `Removed ${removed.length} blank page(s)`),
            tr(`第 ${removed.join(', ')} 页 · 按 Ctrl+S 保存`, `Page(s) ${removed.join(', ')} · Press Ctrl+S to save`)
          )
          return
        }
        await useDocumentStore.getState().applyModifiedPDF(res.outputPath)
      } else {
        setErrorMsg(res?.error || tr('处理遇到错误', 'Processing failed'))
      }
    } catch (e: any) {
      setErrorMsg(e.message || tr('操作异常', 'Operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 头部 */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-brand-950 text-brand-400 border border-brand-800/80">
              {isScanner && <ScanLine className="w-4 h-4" />}
              {isDeskew && <Compass className="w-4 h-4" />}
              {isRemoveBlank && <FileMinus2 className="w-4 h-4" />}
              {isGrayscale && <Contrast className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {isScanner && tr('模拟扫描件效果', 'Scanned Look')}
                {isDeskew && tr('自动纠偏', 'Auto Deskew')}
                {isRemoveBlank && tr('检测并删除空白页', 'Remove Blank Pages')}
                {isGrayscale && tr('黑白灰阶与反色', 'Grayscale & Invert')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isScanner && tr('为电子 PDF 模拟扫描仪的杂色噪点与轻微倾斜', 'Simulate scanner noise and slight skew on a digital PDF')}
                {isDeskew && tr('基于水平文字投影方差自动校正倾斜扫描件', 'Straighten skewed scans using horizontal text projection variance')}
                {isRemoveBlank && tr('基于图像像素方差分析自动剔除无内容页面', 'Detect and remove empty pages using pixel variance analysis')}
                {isGrayscale && tr('灰阶节省耗材，或反色用于暗色阅读', 'Grayscale to save ink, or invert colors for dark reading')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            aria-label={tr('关闭', 'Close')}
            title={tr('关闭', 'Close')}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体参数 */}
        <div className="p-5 space-y-4 text-xs">
          {/* Scanner Effect */}
          {isScanner && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>{tr('复印杂色噪点', 'Noise')}</span>
                  <span className="text-brand-400 font-mono">{scannerNoise}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={scannerNoise}
                  onChange={(e) => setScannerNoise(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>{tr('最大随机倾角', 'Max random skew')}</span>
                  <span className="text-brand-400 font-mono">±{scannerAngle}°</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.1}
                  value={scannerAngle}
                  onChange={(e) => setScannerAngle(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-300 font-medium">{tr('渲染清晰度 (DPI)', 'Resolution (DPI)')}</span>
                <select
                  value={scannerDpi}
                  onChange={(e) => setScannerDpi(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100"
                >
                  <option value={150}>{tr('150 DPI (轻量)', '150 DPI (light)')}</option>
                  <option value={200}>{tr('200 DPI (推荐)', '200 DPI (recommended)')}</option>
                  <option value={300}>{tr('300 DPI (档案级)', '300 DPI (archival)')}</option>
                </select>
              </div>
            </div>
          )}

          {/* Auto Deskew */}
          {isDeskew && (
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-2 text-slate-300">
              <p className="font-semibold text-teal-400">{tr('自动纠偏说明：', 'How auto deskew works:')}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {tr(
                  '算法会对每一页的水平文字行特征进行采样。如果检测到扫描产生的倾斜（-5° ~ +5°），会自动旋转校正为水平。',
                  'Each page is sampled for horizontal text-line features. If a scan skew between -5° and +5° is detected, the page is rotated back to level.'
                )}
              </p>
            </div>
          )}

          {/* Remove Blank Pages */}
          {isRemoveBlank && (
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-2 text-slate-300">
              <p className="font-semibold text-rose-400">{tr('空白页过滤说明：', 'How blank page removal works:')}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {tr(
                  '针对双面扫描或打印中常见的纯白页，算法通过白色像素占比（>99.5%）与方差阈值自动识别并删除，所有包含有效内容的页面都会保留。',
                  'Empty pages common in duplex scans or prints are detected by white-pixel ratio (>99.5%) and a variance threshold, then removed. All pages with content are kept.'
                )}
              </p>
              {resultMsg && (
                <div className="mt-2 p-2 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-lg text-xs">
                  {resultMsg}
                </div>
              )}
            </div>
          )}

          {/* Grayscale or Invert */}
          {isGrayscale && (
            <div className="space-y-3">
              <label className="block text-slate-300 font-medium mb-1.5">{tr('色彩处理模式', 'Color mode')}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setColorMode('grayscale')}
                  className={`p-3 rounded-xl border text-center font-medium transition-all ${
                    colorMode === 'grayscale'
                      ? 'bg-brand-600 border-brand-500 text-white shadow-sm'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-xs">{tr('黑白灰阶化', 'Grayscale')}</div>
                  <div className="text-[10px] text-slate-300/80 mt-0.5">{tr('去除色彩，节省打印耗墨', 'Remove color to save ink')}</div>
                </button>
                <button
                  onClick={() => setColorMode('invert')}
                  className={`p-3 rounded-xl border text-center font-medium transition-all ${
                    colorMode === 'invert'
                      ? 'bg-brand-600 border-brand-500 text-white shadow-sm'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-xs">{tr('反色模式', 'Invert')}</div>
                  <div className="text-[10px] text-slate-300/80 mt-0.5">{tr('黑底白字，适合夜间阅读', 'Light text on dark, for night reading')}</div>
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {resultMsg ? tr('完成并关闭', 'Done') : tr('取消', 'Cancel')}
          </button>
          {!resultMsg && (
            <button
              disabled={isProcessing}
              onClick={handleExecute}
              className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors shadow-md disabled:opacity-40"
            >
              {isProcessing ? tr('正在处理...', 'Processing...') : tr('开始处理', 'Apply')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
