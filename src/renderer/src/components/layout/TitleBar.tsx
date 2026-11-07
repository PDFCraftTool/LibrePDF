import React from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { FileText, X, Plus, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTr } from '../../i18n'

export const TitleBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, openDocument } = useDocumentStore()
  const { t } = useTranslation()
  const tr = useTr()

  const handleOpenNew = async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths && paths.length > 0) {
      await openDocument(paths[0])
    }
  }

  return (
    <div
      className="h-10 bg-[#f8fafc] border-b border-slate-200/90 flex items-center justify-between px-3 select-none text-slate-700"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* 软件标识 */}
      <div className="flex items-center space-x-2 mr-3 px-1">
        <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center shadow-xs">
          <FileText className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-xs tracking-wider text-slate-800">LIBREPDF</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 flex items-center gap-1 font-medium">
          <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
          Local-First
        </span>
      </div>

      {/* 多标签页导航栏 */}
      <div
        className="flex-1 flex items-end h-full overflow-x-auto no-scrollbar space-x-1"
        role="tablist"
        aria-label={tr('打开的 PDF 文档', 'Open PDF documents')}
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  closeTab(tab.id)
                }
              }}
              title={`${tab.originalFilePath}${tab.isModified ? tr('（未保存）', ' (unsaved)') : ''}`}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setActiveTab(tab.id)
                }
              }}
              className={`group flex items-center h-[34px] px-3 text-xs transition-all cursor-pointer border-t border-x rounded-t-md max-w-[220px] min-w-[130px] focus-visible:outline-none ${
                isActive
                  ? 'bg-white border-slate-200 text-slate-900 font-medium shadow-xs relative top-[1px]'
                  : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200/60 hover:text-slate-800'
              }`}
            >
              <FileText className={`w-3.5 h-3.5 mr-1.5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className="truncate flex-1">{tab.fileName}</span>
              {tab.isModified && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-500 ml-1 shrink-0 group-hover:hidden"
                  aria-label={tr('未保存', 'Unsaved')}
                />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className={`p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 ml-1 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
                  tab.isModified ? 'hidden group-hover:block' : isActive ? 'opacity-70' : 'opacity-0'
                }`}
                aria-label={tr(`关闭 ${tab.fileName}`, `Close ${tab.fileName}`)}
                title={tr('关闭 (鼠标中键)', 'Close (middle-click)')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}

        <button
          onClick={handleOpenNew}
          className="p-1.5 mb-1 shrink-0 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded transition-colors"
          title={`${t('toolbar.open')} (Ctrl+O)`}
          aria-label={t('toolbar.open')}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 预留 Windows 窗口按钮区域 */}
      <div className="w-[140px] h-full shrink-0" />
    </div>
  )
}
