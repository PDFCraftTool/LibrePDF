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
        className="h-11 bg-[#0b1112] border-b border-slate-800/80 flex items-center justify-between px-3 select-none"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* 软件标识 */}
      <div className="flex items-center space-x-2 mr-3 px-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-teal-300 flex items-center justify-center shadow-md shadow-brand-950/40">
          <FileText className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-xs tracking-wider text-slate-200">PDFOPEN</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-950/80 border border-brand-800/60 text-brand-400 flex items-center gap-1">
          <ShieldCheck className="w-2.5 h-2.5" />
          Local-First
        </span>
      </div>

      {/* 多标签页导航栏 */}
      <div
        className="flex-1 flex items-center h-full overflow-x-auto no-scrollbar space-x-1"
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
              // 鼠标中键关闭标签（与浏览器/编辑器习惯一致）
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
              className={`group flex items-center h-8 px-3 rounded-md text-xs transition-colors cursor-pointer border border-transparent max-w-[220px] min-w-[130px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                isActive
                  ? 'bg-slate-800/90 border-slate-700 text-slate-100 font-medium shadow-inner'
                  : 'bg-slate-950/60 border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 text-brand-400" />
              <span className="truncate flex-1">{tab.fileName}</span>
              {/* 未保存标记：悬停时切换为关闭按钮 */}
              {tab.isModified && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-400 ml-1 shrink-0 group-hover:hidden"
                  aria-label={tr('未保存', 'Unsaved')}
                />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className={`p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-100 ml-1 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
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
          className="p-1.5 shrink-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-md transition-colors"
          title={`${t('toolbar.open')} (Ctrl+O)`}
          aria-label={t('toolbar.open')}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 预留 Windows titleBarOverlay 窗口按钮区域（最小化/最大化/关闭约 138px），避免标签被遮挡 */}
      <div className="w-[140px] h-full shrink-0" />
    </div>
  )
}
