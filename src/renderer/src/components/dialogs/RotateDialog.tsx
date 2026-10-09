import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, RotateCw, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTr } from '../../i18n'

export const RotateDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const { t } = useTranslation()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [angle, setAngle] = useState(90)
  const [targetScope, setTargetScope] = useState<'current' | 'all'>('current')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (activeDialog !== 'rotate' || !activeTab) return null

  const handleApply = async () => {
    setIsProcessing(true)
    setErrorMsg('')

    const pages = targetScope === 'current' ? [activeTab.currentPage] : []

    try {
      const tempPath = await window.electronAPI.getTempPdfPath('rotated')
      const res = await window.electronAPI.rotatePages(activeTab.filePath, pages, angle, tempPath)
      if (res.success && res.outputPath) {
        await useDocumentStore.getState().applyModifiedPDF(res.outputPath)
      } else {
        setErrorMsg(res.message || tr('旋转页面失败', 'Failed to rotate pages'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('操作异常', 'Operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-indigo-400">
            <RotateCw className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{t('toolbar.rotate')}</h3>
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
          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">{tr('旋转范围', 'Pages')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTargetScope('current')}
                className={`py-2 rounded-lg border text-center font-medium transition-colors ${
                  targetScope === 'current'
                    ? 'bg-indigo-950 border-indigo-500 text-indigo-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tr(`仅当前第 ${activeTab.currentPage} 页`, `Current page only (${activeTab.currentPage})`)}
              </button>
              <button
                onClick={() => setTargetScope('all')}
                className={`py-2 rounded-lg border text-center font-medium transition-colors ${
                  targetScope === 'all'
                    ? 'bg-indigo-950 border-indigo-500 text-indigo-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tr(`全部 ${activeTab.pageCount} 页`, `All ${activeTab.pageCount} pages`)}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">{tr('旋转角度', 'Angle')}</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 90, label: tr('顺时针 90°', '90° clockwise') },
                { val: 180, label: tr('倒置 180°', '180°') },
                { val: 270, label: tr('逆时针 90°', '90° counter-clockwise') }
              ].map((item) => (
                <button
                  key={item.val}
                  onClick={() => setAngle(item.val)}
                  className={`py-2 rounded-lg border text-center font-medium transition-colors ${
                    angle === item.val
                      ? 'bg-indigo-950 border-indigo-500 text-indigo-300'
                      : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
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
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md transition-colors"
          >
            {isProcessing ? tr('正在旋转...', 'Rotating...') : tr('应用旋转', 'Rotate')}
          </button>
        </div>
      </div>
    </div>
  )
}
