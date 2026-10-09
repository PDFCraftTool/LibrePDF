import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, Stamp, Sparkles, Eye, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTr } from '../../i18n'

export const WatermarkDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const { t } = useTranslation()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [text, setText] = useState(() => tr('内部机密 请勿外传', 'INTERNAL USE ONLY'))
  const [position, setPosition] = useState<'tiled' | 'center' | 'header' | 'footer'>('tiled')
  const [fontSize, setFontSize] = useState(32)
  const [opacity, setOpacity] = useState(0.25)
  const [rotation, setRotationAngle] = useState(45)
  const [color, setColor] = useState('#94A3B8') // 默认经典中灰
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (activeDialog !== 'watermark' || !activeTab) return null

  const presetTexts = [
    tr('绝密文件', 'CONFIDENTIAL'),
    tr('内部资料', 'INTERNAL'),
    tr('草稿', 'DRAFT'),
    tr('复印无效', 'COPY'),
    tr('样本', 'SAMPLE'),
    tr('严禁外传', 'DO NOT DISTRIBUTE')
  ]

  const colorPresets = [
    { name: tr('经典灰', 'Gray'), hex: '#94A3B8' },
    { name: tr('印章红', 'Red'), hex: '#EF4444' },
    { name: tr('商务蓝', 'Blue'), hex: '#2563EB' },
    { name: tr('金橘橙', 'Orange'), hex: '#D97706' },
    { name: tr('典雅紫', 'Purple'), hex: '#8B5CF6' },
    { name: tr('墨深黑', 'Black'), hex: '#1E293B' }
  ]

  const handleApply = async () => {
    if (!text.trim()) {
      setErrorMsg(tr('请输入水印文本', 'Please enter watermark text'))
      return
    }

    setIsProcessing(true)
    setErrorMsg('')

    try {
      const tempPath = await window.electronAPI.getTempPdfPath('watermark')
      const res = await window.electronAPI.addWatermark(
        activeTab.filePath,
        {
          text: text.trim(),
          position,
          fontSize,
          opacity,
          rotation,
          color
        },
        tempPath
      )

      if (res.success && res.outputPath) {
        await useDocumentStore.getState().applyModifiedPDF(res.outputPath)
      } else {
        setErrorMsg(res.message || tr('添加水印失败', 'Failed to add watermark'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('执行水印操作异常', 'Watermark operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2.5 text-cyan-400">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <Stamp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">{t('toolbar.watermark')}</h3>
              <p className="text-[11px] text-slate-400">
                {tr('支持平铺、居中印章或页眉页脚，带实时预览', 'Tiled, centered stamp, header or footer, with live preview')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            aria-label={tr('关闭', 'Close')}
            title={tr('关闭', 'Close')}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体：左右分栏（左侧参数控制，右侧白纸实时微缩画框） */}
        <div className="p-5 flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 text-xs">
          {/* 左侧控制区 7 列 */}
          <div className="md:col-span-7 space-y-3.5">
            {/* 文本输入与预设 */}
            <div>
              <label className="block text-slate-300 mb-1 font-medium">{tr('水印文本', 'Watermark text')}</label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-500 font-medium text-xs"
                placeholder={tr('例如：CONFIDENTIAL', 'e.g. CONFIDENTIAL')}
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {presetTexts.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setText(preset)}
                    className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* 布局位置选择 */}
            <div>
              <label className="block text-slate-300 mb-1 font-medium">{tr('布局', 'Layout')}</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'tiled', label: tr('平铺全页', 'Tiled') },
                  { id: 'center', label: tr('居中印章', 'Center') },
                  { id: 'header', label: tr('顶部页眉', 'Header') },
                  { id: 'footer', label: tr('底部页脚', 'Footer') }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPosition(item.id as any)}
                    className={`py-1.5 rounded-lg border text-center font-medium transition-all ${
                      position === item.id
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-300 shadow-sm'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 色板选择 */}
            <div>
              <label className="block text-slate-300 mb-1 font-medium">{tr('水印颜色', 'Color')}</label>
              <div className="flex items-center space-x-2">
                {colorPresets.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setColor(c.hex)}
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-all ${
                      color === c.hex
                        ? 'border-cyan-400 bg-slate-800 text-white font-medium ring-1 ring-cyan-400/50'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-sm"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 滑块微调：字号、透明度、旋转角 */}
            <div className="grid grid-cols-3 gap-2.5 pt-1 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>{tr('字号', 'Size')}</span>
                  <span className="font-mono text-cyan-400">{fontSize}pt</span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={64}
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>{tr('透明度', 'Opacity')}</span>
                  <span className="font-mono text-cyan-400">{Math.round(opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={opacity * 100}
                  onChange={(e) => setOpacity(parseInt(e.target.value, 10) / 100)}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>{tr('旋转角', 'Rotation')}</span>
                  <span className="font-mono text-cyan-400">{rotation}°</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={15}
                  value={rotation}
                  onChange={(e) => setRotationAngle(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-500"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="text-rose-400 bg-rose-950/50 p-2.5 rounded-lg border border-rose-900/60 text-xs">
                {errorMsg}
              </div>
            )}
          </div>

          {/* 右侧微缩白纸实时预览区 5 列 */}
          <div className="md:col-span-5 flex flex-col items-center justify-center bg-slate-950/80 border border-slate-800 rounded-xl p-3 relative overflow-hidden">
            <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-2 self-start">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span>{tr('实时预览', 'Live preview')}</span>
            </div>

            {/* 模拟一张 A4 比例的纸张 (1:1.414) */}
            <div className="w-44 h-60 bg-white rounded-lg shadow-lg relative overflow-hidden flex flex-col p-2 select-none border border-slate-300">
              {/* 模拟文本段落线条 */}
              <div className="w-full space-y-1.5 opacity-20 pointer-events-none">
                <div className="h-2 bg-slate-800 rounded w-1/3 mb-2" />
                <div className="h-1.5 bg-slate-700 rounded w-full" />
                <div className="h-1.5 bg-slate-700 rounded w-11/12" />
                <div className="h-1.5 bg-slate-700 rounded w-4/5" />
                <div className="h-1.5 bg-slate-700 rounded w-full mt-3" />
                <div className="h-1.5 bg-slate-700 rounded w-3/4" />
                <div className="h-1.5 bg-slate-700 rounded w-5/6" />
                <div className="h-1.5 bg-slate-700 rounded w-full mt-3" />
                <div className="h-1.5 bg-slate-700 rounded w-2/3" />
              </div>

              {/* 水印覆盖层 */}
              {position === 'center' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span
                    style={{
                      transform: `rotate(-${rotation}deg)`,
                      fontSize: `${Math.max(10, fontSize * 0.45)}px`,
                      color: color,
                      opacity: opacity,
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {text || tr('水印预览', 'Watermark')}
                  </span>
                </div>
              )}

              {position === 'tiled' && (
                <div className="absolute -inset-10 flex flex-col justify-around pointer-events-none overflow-hidden rotate-[-25deg] opacity-80">
                  {[0, 1, 2, 3].map((row) => (
                    <div key={row} className="flex justify-around space-x-4">
                      {[0, 1].map((col) => (
                        <span
                          key={col}
                          style={{
                            fontSize: `${Math.max(8, fontSize * 0.3)}px`,
                            color: color,
                            opacity: opacity,
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {text || tr('水印预览', 'Watermark')}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {position === 'header' && (
                <div className="absolute top-2 inset-x-0 flex justify-center pointer-events-none">
                  <span
                    style={{
                      fontSize: '9px',
                      color: color,
                      opacity: opacity,
                      fontWeight: 'bold'
                    }}
                  >
                    {text || tr('页眉水印', 'Header watermark')}
                  </span>
                </div>
              )}

              {position === 'footer' && (
                <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
                  <span
                    style={{
                      fontSize: '9px',
                      color: color,
                      opacity: opacity,
                      fontWeight: 'bold'
                    }}
                  >
                    {text || tr('页脚水印', 'Footer watermark')}
                  </span>
                </div>
              )}
            </div>

            <span className="text-[10px] text-slate-500 mt-2">
              {tr('示意预览，实际输出为矢量渲染', 'Approximate preview; output is rendered as vector graphics')}
            </span>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={isProcessing}
            className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 transition-all active:scale-95"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{tr('正在添加水印...', 'Adding watermark...')}</span>
              </>
            ) : (
              <>
                <Stamp className="w-3.5 h-3.5" />
                <span>{tr('应用水印', 'Apply Watermark')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
