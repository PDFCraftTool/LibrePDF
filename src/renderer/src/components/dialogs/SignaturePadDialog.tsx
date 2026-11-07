import React, { useRef, useState, useEffect } from 'react'
import { useFillSignStore } from '../../stores/useFillSignStore'
import { useTr } from '../../i18n'
import { X, Eraser, Check, PenTool } from 'lucide-react'

export const SignaturePadDialog: React.FC = () => {
  const { isSignatureModalOpen, setSignatureModalOpen, saveSignature } = useFillSignStore()
  const tr = useTr()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasContent, setHasContent] = useState(false)
  const [penColor, setPenColor] = useState('#0f172a') // 经典深黑/深蓝墨水

  useEffect(() => {
    if (isSignatureModalOpen) {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.lineWidth = 2.5
        }
      }
      setHasContent(false)
    }
  }, [isSignatureModalOpen])

  if (!isSignatureModalOpen) return null

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getCoordinates(e)
    ctx.strokeStyle = penColor
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
    setHasContent(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasContent) return
    const dataUrl = canvas.toDataURL('image/png')
    saveSignature(dataUrl, tr('手写签名', 'Drawn Signature'))
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-6 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* 顶部标题栏 */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-600">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                {tr('创建并保存手写签名', 'Create & Save Signature')}
              </h3>
              <p className="text-[11px] text-slate-500">
                {tr('手绘签名将保存在本机，随时一键印入合同与报表', 'Stored locally; stamp onto documents anytime')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSignatureModalOpen(false)}
            aria-label={tr('关闭', 'Close')}
            className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 核心画布区 */}
        <div className="p-5 flex flex-col items-center bg-[#f8fafc]">
          <div className="relative w-full h-48 bg-white border-2 border-dashed border-slate-300 rounded-xl overflow-hidden shadow-inner cursor-crosshair">
            <canvas
              ref={canvasRef}
              width={460}
              height={192}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="w-full h-full"
            />
            {!hasContent && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-slate-400 italic">
                {tr('在此处手写签名...', 'Sign here with mouse or stylus...')}
              </div>
            )}
            <div className="absolute bottom-6 left-6 right-6 border-b border-slate-200 pointer-events-none" />
          </div>

          {/* 墨水颜色选择器 */}
          <div className="w-full mt-3 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <span>{tr('墨水颜色：', 'Ink Color:')}</span>
              <button
                type="button"
                onClick={() => setPenColor('#0f172a')}
                className={`w-5 h-5 rounded-full bg-slate-900 border-2 transition-transform ${
                  penColor === '#0f172a' ? 'scale-110 border-blue-500 shadow-xs' : 'border-transparent'
                }`}
                title={tr('黑色', 'Black')}
              />
              <button
                type="button"
                onClick={() => setPenColor('#1d4ed8')}
                className={`w-5 h-5 rounded-full bg-blue-700 border-2 transition-transform ${
                  penColor === '#1d4ed8' ? 'scale-110 border-blue-500 shadow-xs' : 'border-transparent'
                }`}
                title={tr('商业蓝', 'Corporate Blue')}
              />
              <button
                type="button"
                onClick={() => setPenColor('#b91c1c')}
                className={`w-5 h-5 rounded-full bg-red-700 border-2 transition-transform ${
                  penColor === '#b91c1c' ? 'scale-110 border-blue-500 shadow-xs' : 'border-transparent'
                }`}
                title={tr('印泥红', 'Stamp Red')}
              />
            </div>

            <button
              onClick={clearCanvas}
              disabled={!hasContent}
              className="flex items-center space-x-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30 transition-colors"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>{tr('清除', 'Clear')}</span>
            </button>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/90 flex items-center justify-end space-x-2">
          <button
            onClick={() => setSignatureModalOpen(false)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasContent}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shadow-xs transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{tr('保存并使用签名', 'Save & Use Signature')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
