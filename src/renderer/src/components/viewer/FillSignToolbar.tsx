import React, { useState } from 'react'
import { useFillSignStore, FillSignToolType } from '../../stores/useFillSignStore'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { useTr } from '../../i18n'
import {
  Type,
  Check,
  X,
  Circle,
  Calendar,
  PenTool,
  Save,
  Trash2,
  ChevronDown,
  Plus,
  Sparkles
} from 'lucide-react'

interface FillSignToolbarProps {
  onFlatten: () => Promise<void>
  isFlattening: boolean
}

export const FillSignToolbar: React.FC<FillSignToolbarProps> = ({ onFlatten, isFlattening }) => {
  const {
    activeTool,
    setActiveTool,
    fontSize,
    setFontSize,
    color,
    setColor,
    items,
    clearItems,
    savedSignatures,
    setSignatureModalOpen
  } = useFillSignStore()
  const { setViewerMode } = useDocumentStore()
  const tr = useTr()
  const [isSigDropdownOpen, setIsSigDropdownOpen] = useState(false)

  const tools: { id: FillSignToolType; icon: React.ElementType; label: string; title: string }[] = [
    { id: 'text', icon: Type, label: tr('文本', 'Text'), title: tr('添加文字', 'Add text') },
    { id: 'check', icon: Check, label: '✓', title: tr('添加勾选标记', 'Add checkmark') },
    { id: 'cross', icon: X, label: '✗', title: tr('添加叉号标记', 'Add cross mark') },
    { id: 'dot', icon: Circle, label: '●', title: tr('添加圆点', 'Add dot') },
    { id: 'date', icon: Calendar, label: tr('日期', 'Date'), title: tr('添加今天日期', 'Add today date') }
  ]

  const colors = [
    { val: '#000000', label: tr('黑色', 'Black'), bg: 'bg-black' },
    { val: '#1d4ed8', label: tr('经典蓝', 'Blue'), bg: 'bg-blue-700' },
    { val: '#dc2626', label: tr('印泥红', 'Red'), bg: 'bg-red-600' }
  ]

  const fontSizes = [
    { val: 11, label: 'S' },
    { val: 14, label: 'M' },
    { val: 18, label: 'L' }
  ]

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-white/95 border border-slate-200/90 rounded-xl px-3 py-1.5 shadow-md backdrop-blur-sm select-none text-xs text-slate-700 animate-in fade-in duration-150">
      {/* 工具按钮组 */}
      <div className="flex items-center space-x-1 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200">
        {tools.map((t) => {
          const IconComp = t.icon
          const isActive = activeTool === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              title={t.title}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-all ${
                isActive
                  ? 'bg-blue-600 text-white font-medium shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
            >
              <IconComp className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          )
        })}

        {/* 签名/印章下拉菜单 */}
        <div className="relative">
          <button
            onClick={() => setIsSigDropdownOpen((prev) => !prev)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-all ${
              activeTool === 'signature'
                ? 'bg-blue-600 text-white font-medium shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
            title={tr('插入已保存手写签名', 'Insert saved signature')}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{tr('签名', 'Sign')}</span>
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>

          {isSigDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-30 animate-in fade-in zoom-in-95 duration-100">
              <div className="text-[11px] font-semibold text-slate-500 px-2 py-1">
                {tr('我的签名库', 'My Signatures')}
              </div>

              {savedSignatures.map((sig) => (
                <div
                  key={sig.id}
                  onClick={() => {
                    setActiveTool('signature')
                    setIsSigDropdownOpen(false)
                  }}
                  className="group flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-pointer transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <img
                      src={sig.dataUrl}
                      alt={sig.name}
                      className="h-7 max-w-[100px] object-contain border border-slate-100 rounded bg-white p-0.5"
                    />
                    <span className="text-xs font-medium text-slate-800">{sig.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      useFillSignStore.getState().deleteSignature(sig.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600 transition-opacity"
                    title={tr('删除签名', 'Delete signature')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {savedSignatures.length === 0 && (
                <div className="text-center py-3 text-xs text-slate-400">
                  {tr('暂未保存签名', 'No signatures saved')}
                </div>
              )}

              <div className="border-t border-slate-100 mt-1.5 pt-1.5">
                <button
                  onClick={() => {
                    setIsSigDropdownOpen(false)
                    setSignatureModalOpen(true)
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tr('手绘新签名', 'Draw new signature')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-4 w-px bg-slate-200" />

      {/* 字体大小选择器 */}
      <div className="flex items-center space-x-0.5 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200">
        {fontSizes.map((s) => (
          <button
            key={s.val}
            onClick={() => setFontSize(s.val)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              fontSize === s.val
                ? 'bg-white font-bold text-slate-800 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 字体/墨水颜色选择器 */}
      <div className="flex items-center space-x-1.5">
        {colors.map((c) => (
          <button
            key={c.val}
            onClick={() => setColor(c.val)}
            className={`w-4.5 h-4.5 rounded-full ${c.bg} transition-transform ${
              color === c.val ? 'ring-2 ring-blue-500 ring-offset-1 scale-110 shadow-2xs' : 'opacity-70 hover:opacity-100'
            }`}
            title={c.label}
          />
        ))}
      </div>

      <div className="h-4 w-px bg-slate-200" />

      {/* 清空未固化项 */}
      {items.length > 0 && (
        <button
          onClick={clearItems}
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title={tr('清除本页未烘焙项', 'Clear unbaked items')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 烘焙固化至 PDF */}
      <button
        onClick={onFlatten}
        disabled={isFlattening || items.length === 0}
        className="flex items-center space-x-1 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-colors"
        title={tr('将当前所有填表与签名永久写入 PDF 正文流', 'Permanently burn all form inputs & signatures into the PDF')}
      >
        <Save className="w-3.5 h-3.5" />
        <span>{tr('烘焙固化', 'Flatten & Save')}</span>
        {items.length > 0 && (
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-800 text-[10px] font-mono">
            {items.length}
          </span>
        )}
      </button>

      {/* 完成/退出按钮 */}
      <button
        onClick={() => setViewerMode('view')}
        className="px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
      >
        {tr('退出', 'Done')}
      </button>
    </div>
  )
}
