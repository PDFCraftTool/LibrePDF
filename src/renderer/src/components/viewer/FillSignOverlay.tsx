import React, { useRef, useState } from 'react'
import { useFillSignStore, FillSignItem } from '../../stores/useFillSignStore'
import { useTr } from '../../i18n'
import { Trash2, GripVertical, Plus, Minus } from 'lucide-react'

interface FillSignOverlayProps {
  pageViewport: { width: number; height: number; scale: number }
  currentPage: number
}

export const FillSignOverlay: React.FC<FillSignOverlayProps> = ({ pageViewport, currentPage }) => {
  const {
    items,
    addItem,
    updateItem,
    removeItem,
    selectedItemId,
    setSelectedItemId,
    activeTool,
    fontSize,
    color,
    savedSignatures,
    setSignatureModalOpen
  } = useFillSignStore()
  const tr = useTr()

  // 拖动状态
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const dragStartPos = useRef<{ mouseX: number; mouseY: number; initXRatio: number; initYRatio: number } | null>(null)

  // 签名缩放状态
  const [resizingItemId, setResizingItemId] = useState<string | null>(null)
  const resizeStartPos = useRef<{ mouseX: number; initWidthRatio: number } | null>(null)

  const pageItems = items.filter((it) => it.page === currentPage)

  // 点击空白处添加新项
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 仅在直接点击容器背景时添加
    if (e.target !== e.currentTarget) return

    const rect = e.currentTarget.getBoundingClientRect()
    const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const yRatio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))

    if (activeTool === 'signature') {
      if (savedSignatures.length === 0) {
        setSignatureModalOpen(true)
        return
      }
      const activeSig = savedSignatures[0]
      addItem({
        id: `fs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'signature',
        page: currentPage,
        xRatio,
        yRatio,
        fontSize,
        color,
        signatureDataUrl: activeSig.dataUrl,
        widthRatio: 0.22,
        heightRatio: 0.08
      })
      return
    }

    if (activeTool === 'date') {
      const today = new Date().toISOString().slice(0, 10)
      addItem({
        id: `fs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'date',
        page: currentPage,
        xRatio,
        yRatio,
        text: today,
        fontSize,
        color
      })
      return
    }

    if (activeTool === 'check' || activeTool === 'cross' || activeTool === 'dot') {
      addItem({
        id: `fs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: activeTool,
        page: currentPage,
        xRatio,
        yRatio,
        text: activeTool === 'check' ? '✓' : activeTool === 'cross' ? '✗' : '●',
        fontSize: fontSize * 1.2,
        color
      })
      return
    }

    // 默认 text
    addItem({
      id: `fs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'text',
      page: currentPage,
      xRatio,
      yRatio,
      text: '',
      fontSize,
      color
    })
  }

  // 拖动处理
  const handleDragStart = (e: React.MouseEvent, item: FillSignItem) => {
    e.stopPropagation()
    setSelectedItemId(item.id)
    setDraggingItemId(item.id)
    dragStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initXRatio: item.xRatio,
      initYRatio: item.yRatio
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartPos.current) return
      const deltaX = moveEvent.clientX - dragStartPos.current.mouseX
      const deltaY = moveEvent.clientY - dragStartPos.current.mouseY
      const deltaXRatio = deltaX / pageViewport.width
      const deltaYRatio = deltaY / pageViewport.height

      updateItem(item.id, {
        xRatio: Math.max(0, Math.min(0.95, dragStartPos.current.initXRatio + deltaXRatio)),
        yRatio: Math.max(0, Math.min(0.95, dragStartPos.current.initYRatio + deltaYRatio))
      })
    }

    const handleMouseUp = () => {
      setDraggingItemId(null)
      dragStartPos.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // 签名缩放处理
  const handleResizeStart = (e: React.MouseEvent, item: FillSignItem) => {
    e.stopPropagation()
    setResizingItemId(item.id)
    resizeStartPos.current = {
      mouseX: e.clientX,
      initWidthRatio: item.widthRatio || 0.22
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeStartPos.current) return
      const deltaX = moveEvent.clientX - resizeStartPos.current.mouseX
      const deltaRatio = deltaX / pageViewport.width
      const newWidthRatio = Math.max(0.08, Math.min(0.7, resizeStartPos.current.initWidthRatio + deltaRatio))
      updateItem(item.id, {
        widthRatio: newWidthRatio,
        heightRatio: newWidthRatio * 0.36
      })
    }

    const handleMouseUp = () => {
      setResizingItemId(null)
      resizeStartPos.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      onClick={handleContainerClick}
      className="absolute inset-0 z-20 pointer-events-auto cursor-text select-none"
    >
      {pageItems.map((item) => {
        const isSelected = selectedItemId === item.id
        const left = item.xRatio * pageViewport.width
        const top = item.yRatio * pageViewport.height

        return (
          <div
            key={item.id}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedItemId(item.id)
            }}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              color: item.color
            }}
            className={`absolute flex items-center group transition-shadow ${
              isSelected
                ? 'z-30 ring-2 ring-blue-500 rounded-sm bg-blue-50/20'
                : 'hover:ring-1 hover:ring-blue-300 rounded-sm'
            }`}
          >
            {/* 选中浮动迷你操作栏 */}
            {isSelected && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute -top-8 left-0 flex items-center space-x-1 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 shadow-md text-slate-700 select-none z-40 animate-in fade-in duration-100"
              >
                {/* 拖动抓手 */}
                <div
                  onMouseDown={(e) => handleDragStart(e, item)}
                  className="cursor-move p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                  title={tr('拖动移动位置', 'Drag to move')}
                >
                  <GripVertical className="w-3 h-3" />
                </div>

                {/* 字号增减（非签名） */}
                {item.type !== 'signature' && (
                  <>
                    <button
                      onClick={() => updateItem(item.id, { fontSize: Math.max(8, item.fontSize - 2) })}
                      className="p-0.5 hover:bg-slate-100 rounded text-slate-600"
                      title={tr('缩小字号', 'Decrease size')}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] font-mono px-0.5">{item.fontSize}</span>
                    <button
                      onClick={() => updateItem(item.id, { fontSize: Math.min(36, item.fontSize + 2) })}
                      className="p-0.5 hover:bg-slate-100 rounded text-slate-600"
                      title={tr('放大字号', 'Increase size')}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <div className="h-3 w-px bg-slate-200" />
                  </>
                )}

                {/* 删除 */}
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-0.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-colors"
                  title={tr('删除', 'Delete')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* 内容渲染 */}
            {item.type === 'text' || item.type === 'date' ? (
              <input
                type="text"
                autoFocus={isSelected && !item.text}
                value={item.text || ''}
                onChange={(e) => updateItem(item.id, { text: e.target.value })}
                placeholder={item.type === 'date' ? 'YYYY-MM-DD' : tr('在此输入文字...', 'Type text...')}
                style={{
                  fontSize: `${item.fontSize * pageViewport.scale}px`,
                  color: item.color
                }}
                className="bg-transparent border-none outline-none font-sans px-1 py-0 leading-none placeholder:text-slate-300"
              />
            ) : item.type === 'check' || item.type === 'cross' || item.type === 'dot' ? (
              <span
                onMouseDown={(e) => handleDragStart(e, item)}
                style={{
                  fontSize: `${(item.fontSize || 16) * pageViewport.scale}px`,
                  color: item.color,
                  lineHeight: 1
                }}
                className="cursor-move px-1 font-bold select-none"
              >
                {item.text}
              </span>
            ) : item.type === 'signature' && item.signatureDataUrl ? (
              <div
                onMouseDown={(e) => handleDragStart(e, item)}
                style={{
                  width: `${(item.widthRatio || 0.22) * pageViewport.width}px`,
                  height: `${(item.heightRatio || 0.08) * pageViewport.height}px`
                }}
                className="relative cursor-move select-none p-1"
              >
                <img
                  src={item.signatureDataUrl}
                  alt="signature"
                  className="w-full h-full object-contain pointer-events-none"
                />
                {/* 缩放手柄 */}
                {isSelected && (
                  <div
                    onMouseDown={(e) => handleResizeStart(e, item)}
                    className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-600 rounded-full cursor-se-resize shadow-xs"
                    title={tr('拖拽缩放签名大小', 'Drag to resize')}
                  />
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
