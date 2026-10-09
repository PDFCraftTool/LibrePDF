import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, Images, Plus, Trash2, ArrowUp, ArrowDown, FileCheck, Sparkles } from 'lucide-react'
import { useTr } from '../../i18n'

export const ImageConvertDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, openDocument } = useDocumentStore()
  const tr = useTr()
  const [imageFiles, setImageFiles] = useState<string[]>([])
  const [pageSize, setPageSize] = useState<'fit' | 'A4'>('fit')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (activeDialog !== 'imagesToPdf') return null

  const handleAddImages = async () => {
    try {
      const paths = await window.electronAPI.openFileDialog({
        multiSelections: true,
        filters: [
          { name: tr('图片 (JPG/PNG/WebP/TIFF/GIF/BMP)', 'Images (JPG/PNG/WebP/TIFF/GIF/BMP)'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'gif', 'bmp'] }
        ]
      })
      if (paths && paths.length > 0) {
        setImageFiles((prev) => [...prev, ...paths])
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('选取图片失败', 'Failed to select images'))
    }
  }

  const handleRemove = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= imageFiles.length) return
    const updated = [...imageFiles]
    const temp = updated[index]
    updated[index] = updated[targetIdx]
    updated[targetIdx] = temp
    setImageFiles(updated)
  }

  const handleConvert = async () => {
    if (imageFiles.length === 0) {
      setErrorMsg(
        tr(
          '请至少添加一张图片（支持 JPG、PNG、WebP、TIFF、GIF、BMP）',
          'Please add at least one image (JPG, PNG, WebP, TIFF, GIF, BMP)'
        )
      )
      return
    }

    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: 'converted_images.pdf',
      filters: [{ name: tr('PDF 文档', 'PDF Document'), extensions: ['pdf'] }]
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')

    try {
      const res = await window.electronAPI.imagesToPDF(imageFiles, pageSize, savePath)
      if (res.success && res.outputPath) {
        await openDocument(res.outputPath)
        setActiveDialog('none')
      } else {
        setErrorMsg(res.message || tr('图片转换 PDF 失败', 'Failed to convert images to PDF'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('图片转换过程发生异常', 'An error occurred during image conversion'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-pink-400">
            <Images className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('图片批量合并转 PDF', 'Images to PDF')}</h3>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            aria-label={tr('关闭', 'Close')}
            title={tr('关闭', 'Close')}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体内容 */}
        <div className="p-5 flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {tr(
                `已选图片列表 (${imageFiles.length})，按列表先后顺序生成页码：`,
                `Selected images (${imageFiles.length}), pages follow list order:`
              )}
            </span>
            <button
              onClick={handleAddImages}
              className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tr('添加图片', 'Add Images')}</span>
            </button>
          </div>

          {/* 文件列表 */}
          <div className="max-h-56 min-h-[140px] overflow-y-auto space-y-1.5 p-2 bg-slate-950/60 rounded-xl border border-slate-800">
            {imageFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-500 space-y-2">
                <Images className="w-8 h-8 opacity-40 text-pink-400" />
                <span className="text-xs">
                  {tr(
                    '支持 JPG / PNG / WebP / TIFF / GIF / BMP 图片，点击右上角“添加图片”',
                    'Supports JPG / PNG / WebP / TIFF / GIF / BMP. Click "Add Images" above.'
                  )}
                </span>
              </div>
            ) : (
              imageFiles.map((file, idx) => {
                const fileName = file.split(/[\\/]/).pop() || file
                return (
                  <div
                    key={`${file}-${idx}`}
                    className="flex items-center justify-between px-3 py-2 bg-slate-900/80 hover:bg-slate-850 border border-slate-800/80 rounded-lg text-xs transition-colors"
                  >
                    <div className="flex items-center space-x-2.5 truncate max-w-[280px]">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pink-950/70 border border-pink-900/60 text-pink-300">
                        #{idx + 1}
                      </span>
                      <span className="truncate text-slate-200" title={file}>
                        {fileName}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleMove(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20 hover:bg-slate-800 rounded transition-colors"
                        title={tr('上移', 'Move up')}
                        aria-label={tr('上移', 'Move up')}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMove(idx, 'down')}
                        disabled={idx === imageFiles.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20 hover:bg-slate-800 rounded transition-colors"
                        title={tr('下移', 'Move down')}
                        aria-label={tr('下移', 'Move down')}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemove(idx)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded transition-colors ml-1"
                        title={tr('移除', 'Remove')}
                        aria-label={tr('移除', 'Remove')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* 页面版式设置 */}
          <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-800/80 space-y-2">
            <span className="text-xs font-medium text-slate-300">{tr('页面尺寸', 'Page Size')}</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label
                onClick={() => setPageSize('fit')}
                className={`flex items-center space-x-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  pageSize === 'fit'
                    ? 'border-pink-500 bg-pink-950/20 text-pink-200'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="pageSize"
                  checked={pageSize === 'fit'}
                  onChange={() => setPageSize('fit')}
                  className="hidden"
                />
                <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
                <div>
                  <div className="font-medium text-slate-200">{tr('原图自适应', 'Fit to image')}</div>
                  <div className="text-[11px] text-slate-400">
                    {tr('PDF 页面尺寸与原始图片像素 1:1 匹配', 'Page size matches image pixels 1:1')}
                  </div>
                </div>
              </label>

              <label
                onClick={() => setPageSize('A4')}
                className={`flex items-center space-x-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  pageSize === 'A4'
                    ? 'border-pink-500 bg-pink-950/20 text-pink-200'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="pageSize"
                  checked={pageSize === 'A4'}
                  onChange={() => setPageSize('A4')}
                  className="hidden"
                />
                <FileCheck className="w-4 h-4 text-pink-400 shrink-0" />
                <div>
                  <div className="font-medium text-slate-200">{tr('标准 A4 规格', 'Standard A4')}</div>
                  <div className="text-[11px] text-slate-400">
                    {tr(
                      '固定为 A4 (595×842 pt)，图片等比缩放并居中',
                      'Fixed A4 (595×842 pt), images scaled proportionally and centered'
                    )}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg">
              {errorMsg}
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            onClick={handleConvert}
            disabled={isProcessing || imageFiles.length === 0}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-pink-600/20 transition-all"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{tr('生成中...', 'Generating...')}</span>
              </>
            ) : (
              <>
                <FileCheck className="w-3.5 h-3.5" />
                <span>{tr('转换为 PDF', 'Convert to PDF')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
