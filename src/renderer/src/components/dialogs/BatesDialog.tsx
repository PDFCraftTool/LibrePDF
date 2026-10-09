import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, Hash } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTr } from '../../i18n'

export const BatesDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const { t } = useTranslation()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [prefix, setPrefix] = useState('CONF-')
  const [suffix, setSuffix] = useState('')
  const [startNumber, setStartNumber] = useState(1)
  const [digits, setDigits] = useState(6)
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left' | 'bottom-center' | 'top-right' | 'top-left'>('bottom-right')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (activeDialog !== 'bates' || !activeTab) return null

  const handleApply = async () => {
    setIsProcessing(true)
    setErrorMsg('')

    try {
      const tempPath = await window.electronAPI.getTempPdfPath('bates')
      const res = await window.electronAPI.applyBatesNumbering(
        activeTab.filePath,
        {
          prefix,
          suffix,
          startNumber,
          digits,
          position
        },
        tempPath
      )

      if (res.success && res.outputPath) {
        await useDocumentStore.getState().applyModifiedPDF(res.outputPath)
      } else {
        setErrorMsg(res.message || tr('应用贝茨编号失败', 'Failed to apply Bates numbering'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('操作异常', 'Operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const samplePreview = `${prefix}${String(startNumber).padStart(digits, '0')}${suffix}`

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-purple-400">
            <Hash className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{t('toolbar.bates')}</h3>
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

        <div className="p-5 flex-1 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{tr('首页编号预览', 'First page preview')}</span>
            <span className="font-mono text-base font-bold text-purple-400">{samplePreview}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">{tr('编号前缀', 'Prefix')}</label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">{tr('编号后缀', 'Suffix')}</label>
              <input
                type="text"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">{tr('起始编号', 'Start number')}</label>
              <input
                type="number"
                min={1}
                value={startNumber}
                onChange={(e) => setStartNumber(parseInt(e.target.value, 10) || 1)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">{tr('数字位数（补零）', 'Digits (zero-padded)')}</label>
              <input
                type="number"
                min={3}
                max={12}
                value={digits}
                onChange={(e) => setDigits(parseInt(e.target.value, 10) || 6)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">{tr('编号位置', 'Position')}</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'bottom-right', label: tr('右下角', 'Bottom right') },
                { id: 'bottom-center', label: tr('正下方', 'Bottom center') },
                { id: 'bottom-left', label: tr('左下角', 'Bottom left') },
                { id: 'top-right', label: tr('右上角', 'Top right') },
                { id: 'top-left', label: tr('左上角', 'Top left') }
              ].map((pos) => (
                <button
                  key={pos.id}
                  onClick={() => setPosition(pos.id as any)}
                  className={`py-1.5 rounded-lg border text-center font-medium transition-colors ${
                    position === pos.id
                      ? 'bg-purple-950 border-purple-500 text-purple-300'
                      : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="text-rose-400 bg-rose-950/50 p-2.5 rounded-lg border border-rose-900/60">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={isProcessing}
            className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md transition-colors"
          >
            {isProcessing ? tr('正在添加编号...', 'Applying numbers...') : tr('应用并另存为', 'Apply & Save As')}
          </button>
        </div>
      </div>
    </div>
  )
}
