import React, { useEffect, useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { useTr } from '../../i18n'
import { PagePositionPicker, PdfRect } from '../viewer/PagePositionPicker'
import { X, Stamp, FileUp, CheckCircle2, AlertCircle } from 'lucide-react'

const STAMP_ID = 'stamp'

export const StampSignatureDialog: React.FC = () => {
  const tr = useTr()
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isOpen = activeDialog === 'stamp'

  const [stampImagePath, setStampImagePath] = useState<string>('')
  const [pageNumber, setPageNumber] = useState<number>(1)
  // 坐标约定与 addStampOrSignature（pdf-lib drawImage）一致：(x, y) 为图片左下角，PDF 用户空间
  const [posX, setPosX] = useState<number>(400)
  const [posY, setPosY] = useState<number>(100)
  const [stampWidth, setStampWidth] = useState<number>(120)
  const [stampHeight, setStampHeight] = useState<number>(120)
  // 当前预览页的 view 框 [x0, y0, x1, y1]，用于快捷位置计算
  const [pageView, setPageView] = useState<number[] | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const pageCount = Math.max(1, activeTab?.pageCount || 1)
  const clampPage = (p: number) => Math.max(1, Math.min(pageCount, Math.round(p) || 1))

  // 打开弹窗时定位到文档当前页
  useEffect(() => {
    if (isOpen && activeTab) {
      setPageNumber(Math.max(1, Math.min(activeTab.pageCount || 1, activeTab.currentPage || 1)))
      setErrorMsg('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab?.id])

  if (!isOpen) return null

  const handleSelectStamp = async () => {
    const paths = await window.electronAPI.openFileDialog({
      multiSelections: false,
      filters: [{ name: tr('图章/签名图片 (PNG/JPG)', 'Stamp / signature image (PNG/JPG)'), extensions: ['png', 'jpg', 'jpeg'] }]
    })
    if (paths && paths.length > 0) {
      setStampImagePath(paths[0])
    }
  }

  const applyPreset = (preset: 'bottomRight' | 'center') => {
    const [x0, y0, x1, y1] = pageView || [0, 0, 595, 842]
    if (preset === 'bottomRight') {
      setPosX(Math.round(Math.max(x0, x1 - stampWidth - 40)))
      setPosY(Math.round(y0 + 60))
    } else {
      setPosX(Math.round((x0 + x1 - stampWidth) / 2))
      setPosY(Math.round((y0 + y1 - stampHeight) / 2))
    }
  }

  const handlePickerChange = (rect: PdfRect) => {
    setPosX(rect.x)
    setPosY(rect.y)
    setStampWidth(rect.width)
    setStampHeight(rect.height)
  }

  const handleApply = async () => {
    if (!activeTab) {
      setErrorMsg(tr('请先打开待盖章的 PDF 文档', 'Please open a PDF document first'))
      return
    }
    if (!stampImagePath) {
      setErrorMsg(tr('请先选择印章或手写签名图片文件', 'Please choose a stamp or signature image first'))
      return
    }

    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: activeTab.fileName.replace(/\.pdf$/i, '_stamped.pdf')
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')

    try {
      const res = await window.electronAPI.pdfAddStampOrSignature(
        activeTab.filePath,
        stampImagePath,
        {
          pageNumber: clampPage(pageNumber),
          x: posX,
          y: posY,
          width: stampWidth,
          height: stampHeight
        },
        savePath
      )

      if (res.success && res.outputPath) {
        await openDocument(res.outputPath)
        setActiveDialog('none')
      } else {
        setErrorMsg(res.message || tr('盖章处理失败', 'Failed to apply the stamp'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('盖章过程异常', 'An error occurred while applying the stamp'))
    } finally {
      setIsProcessing(false)
    }
  }

  const inputCls = 'w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div
        className={`w-full ${stampImagePath && activeTab ? 'max-w-4xl' : 'max-w-md'} max-h-[92vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200`}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-rose-400">
            <Stamp className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('添加印章与手写签名图片', 'Add Stamp / Signature Image')}</h3>
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

        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row min-h-0">
          <div className="p-5 flex-1 space-y-4 text-xs min-w-0">
            {/* 选择印章/签名文件 */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">
                {tr('印章或手写签名图片（推荐透明背景 PNG）：', 'Stamp or signature image (transparent PNG recommended):')}
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  readOnly
                  value={stampImagePath}
                  placeholder={tr('点击右侧按钮选择图片文件', 'Click Browse to choose an image')}
                  aria-label={tr('图片路径', 'Image path')}
                  className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 truncate focus:outline-none font-mono text-[11px]"
                />
                <button
                  onClick={handleSelectStamp}
                  className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white shrink-0 flex items-center space-x-1"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{tr('浏览', 'Browse')}</span>
                </button>
              </div>
            </div>

            {/* 页码与尺寸 */}
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1 block">
                <span className="text-slate-400">{tr('目标页码', 'Page')}</span>
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={pageNumber}
                  onChange={(e) => setPageNumber(clampPage(parseInt(e.target.value)))}
                  className={inputCls}
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-slate-400">{tr('宽度 (pt)', 'Width (pt)')}</span>
                <input
                  type="number"
                  min={10}
                  value={stampWidth}
                  onChange={(e) => setStampWidth(Math.max(10, parseInt(e.target.value) || 10))}
                  className={inputCls}
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-slate-400">{tr('高度 (pt)', 'Height (pt)')}</span>
                <input
                  type="number"
                  min={10}
                  value={stampHeight}
                  onChange={(e) => setStampHeight(Math.max(10, parseInt(e.target.value) || 10))}
                  className={inputCls}
                />
              </label>
            </div>

            {/* 坐标设定 */}
            <div className="space-y-1.5">
              <span className="text-slate-400 block">
                {tr('左下角坐标 X, Y（pt，原点在页面左下角）', 'Bottom-left corner X, Y (pt, origin at bottom-left)')}
              </span>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  aria-label="X"
                  placeholder="X"
                  value={posX}
                  onChange={(e) => setPosX(parseInt(e.target.value) || 0)}
                  className={inputCls}
                />
                <input
                  type="number"
                  aria-label="Y"
                  placeholder="Y"
                  value={posY}
                  onChange={(e) => setPosY(parseInt(e.target.value) || 0)}
                  className={inputCls}
                />
              </div>
              <div className="flex gap-2 pt-1 text-[11px]">
                <button
                  onClick={() => applyPreset('bottomRight')}
                  className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  {tr('右下角落款处', 'Bottom-right')}
                </button>
                <button
                  onClick={() => applyPreset('center')}
                  className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  {tr('页面居中', 'Page center')}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {tr(
                  '图片会被缩放填满此框；如需保持原始比例，请将框调整为与图片相同的宽高比。',
                  'The image is scaled to fill this box. To keep its original proportions, size the box to the image aspect ratio.'
                )}
              </p>
            </div>

            {!stampImagePath && (
              <p className="text-[11px] text-slate-500">
                {tr('选择图片后将显示页面预览，可直接拖动放置印章。', 'After choosing an image, a page preview appears where you can drag the stamp into place.')}
              </p>
            )}

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* 页面预览：拖动/缩放代表印章的方框 */}
          {stampImagePath && activeTab && (
            <div className="shrink-0 p-5 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-950/40 flex justify-center">
              <PagePositionPicker
                data={activeTab.data}
                pageNumber={clampPage(pageNumber)}
                pageCount={pageCount}
                onPageChange={(p) => setPageNumber(clampPage(p))}
                mode="point"
                rects={[
                  {
                    id: STAMP_ID,
                    label: tr('印章', 'Stamp'),
                    rect: { x: posX, y: posY, width: stampWidth, height: stampHeight }
                  }
                ]}
                selectedId={STAMP_ID}
                onChange={handlePickerChange}
                defaultSize={{ width: stampWidth, height: stampHeight }}
                onPageInfo={(info) => setPageView(info.view)}
                width={380}
              />
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={isProcessing || !activeTab || !stampImagePath}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 transition-all"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{tr('盖章中...', 'Applying...')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{tr('加盖印章', 'Apply stamp')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
