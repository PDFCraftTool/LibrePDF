import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import { Scissors, Check, X, Layers } from 'lucide-react'

interface VisualCropOverlayProps {
  pageViewport: { width: number; height: number; scale: number }
}

export const VisualCropOverlay: React.FC<VisualCropOverlayProps> = ({ pageViewport }) => {
  const { setViewerMode, tabs, activeTabId, applyModifiedPDF } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  // 裁剪比例（0 ~ 0.4）：表示从各边缘内缩的比例
  const [marginTop, setMarginTop] = useState(0.08)
  const [marginBottom, setMarginBottom] = useState(0.08)
  const [marginLeft, setMarginLeft] = useState(0.08)
  const [marginRight, setMarginRight] = useState(0.08)
  const [isProcessing, setIsProcessing] = useState(false)

  const leftPx = marginLeft * pageViewport.width
  const topPx = marginTop * pageViewport.height
  const widthPx = (1 - marginLeft - marginRight) * pageViewport.width
  const heightPx = (1 - marginTop - marginBottom) * pageViewport.height

  const handleApplyCrop = async (allPages: boolean) => {
    if (!activeTab) return
    setIsProcessing(true)

    try {
      // 真实 PDF 点尺寸（1 point = 1/72 inch）
      const baseW = pageViewport.width / pageViewport.scale
      const baseH = pageViewport.height / pageViewport.scale

      const margins = {
        top: Math.round(marginTop * baseH),
        bottom: Math.round(marginBottom * baseH),
        left: Math.round(marginLeft * baseW),
        right: Math.round(marginRight * baseW)
      }

      const tempPath = await window.electronAPI.getTempPdfPath('crop')
      const res = await window.electronAPI.pdfCropOrMargin(activeTab.filePath, margins, 'crop', tempPath)
      if (!res.success) throw new Error(res.error || 'Crop failed')

      await applyModifiedPDF(tempPath)
      setViewerMode('view')
      toast.success(
        tr('白边裁剪已完成', 'Crop completed'),
        tr('已成功无损设置 CropBox 移除页面多余边距', 'Successfully updated CropBox without quality loss')
      )
    } catch (err: any) {
      toast.error(tr('裁剪失败', 'Crop failed'), err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="absolute inset-0 z-30 pointer-events-auto select-none">
      {/* 顶部浮动控制条 */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center space-x-2 bg-white/95 border border-slate-200/90 rounded-xl px-3.5 py-1.5 shadow-md backdrop-blur-sm text-xs text-slate-700 animate-in fade-in duration-150">
        <div className="flex items-center space-x-1.5 text-blue-700 font-medium">
          <Scissors className="w-3.5 h-3.5" />
          <span>{tr('可视裁剪', 'Crop')}</span>
        </div>

        <div className="h-4 w-px bg-slate-200" />

        <div className="text-[11px] text-slate-500 font-mono">
          {tr('留白内缩：', 'Margin:')} L:{Math.round(marginLeft * 100)}% R:{Math.round(marginRight * 100)}% T:{Math.round(marginTop * 100)}% B:{Math.round(marginBottom * 100)}%
        </div>

        {/* 预设微调按钮 */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              setMarginTop(0.05)
              setMarginBottom(0.05)
              setMarginLeft(0.05)
              setMarginRight(0.05)
            }}
            className="px-2 py-0.5 rounded text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          >
            5%
          </button>
          <button
            onClick={() => {
              setMarginTop(0.1)
              setMarginBottom(0.1)
              setMarginLeft(0.1)
              setMarginRight(0.1)
            }}
            className="px-2 py-0.5 rounded text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          >
            10%
          </button>
          <button
            onClick={() => {
              setMarginTop(0.15)
              setMarginBottom(0.15)
              setMarginLeft(0.15)
              setMarginRight(0.15)
            }}
            className="px-2 py-0.5 rounded text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          >
            15%
          </button>
        </div>

        <div className="h-4 w-px bg-slate-200" />

        {/* 应用按钮 */}
        <button
          onClick={() => handleApplyCrop(false)}
          disabled={isProcessing}
          className="flex items-center space-x-1 px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-xs transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{tr('应用裁剪', 'Apply Crop')}</span>
        </button>

        <button
          onClick={() => setViewerMode('view')}
          className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          title={tr('取消', 'Cancel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 半透明遮罩层（四周蒙黑） */}
      <div
        style={{ height: `${topPx}px` }}
        className="absolute top-0 left-0 right-0 bg-slate-900/40 backdrop-blur-2xs"
      />
      <div
        style={{ height: `${marginBottom * pageViewport.height}px` }}
        className="absolute bottom-0 left-0 right-0 bg-slate-900/40 backdrop-blur-2xs"
      />
      <div
        style={{
          top: `${topPx}px`,
          bottom: `${marginBottom * pageViewport.height}px`,
          width: `${leftPx}px`
        }}
        className="absolute left-0 bg-slate-900/40 backdrop-blur-2xs"
      />
      <div
        style={{
          top: `${topPx}px`,
          bottom: `${marginBottom * pageViewport.height}px`,
          width: `${marginRight * pageViewport.width}px`
        }}
        className="absolute right-0 bg-slate-900/40 backdrop-blur-2xs"
      />

      {/* 中间透亮裁剪框 */}
      <div
        style={{
          left: `${leftPx}px`,
          top: `${topPx}px`,
          width: `${widthPx}px`,
          height: `${heightPx}px`
        }}
        className="absolute border-2 border-dashed border-blue-500 shadow-2xl rounded-xs pointer-events-none"
      >
        <div className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow-xs font-mono">
          {Math.round(widthPx / pageViewport.scale)} × {Math.round(heightPx / pageViewport.scale)} pt
        </div>
      </div>
    </div>
  )
}
