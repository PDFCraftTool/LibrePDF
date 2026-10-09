import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { useTr } from '../../i18n'
import {
  X,
  Grid2X2,
  Maximize2,
  BookOpen,
  ShieldCheck,
  Crop,
  Check,
  AlertCircle
} from 'lucide-react'

export const ImpositionDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  // N-Up 参数
  const [nUpCount, setNUpCount] = useState<2 | 4 | 9>(2)
  const [drawBorder, setDrawBorder] = useState(true)

  // 海报 Posterize 参数
  const [posterRows, setPosterRows] = useState(2)
  const [posterCols, setPosterCols] = useState(2)

  // 裁剪与白边参数
  const [cropTop, setCropTop] = useState(20)
  const [cropBottom, setCropBottom] = useState(20)
  const [cropLeft, setCropLeft] = useState(20)
  const [cropRight, setCropRight] = useState(20)
  const [cropMode, setCropMode] = useState<'crop' | 'pad'>('crop')

  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isNUp = activeDialog === 'nup'
  const isPosterize = activeDialog === 'posterize'
  const isBooklet = activeDialog === 'booklet'
  const isSanitize = activeDialog === 'sanitize'
  const isCrop = activeDialog === 'crop'

  if (!activeTab || (!isNUp && !isPosterize && !isBooklet && !isSanitize && !isCrop)) {
    return null
  }

  const handleExecute = async () => {
    setIsProcessing(true)
    setErrorMsg('')

    try {
      const baseName = activeTab.filePath.replace(/\.pdf$/i, '')
      let defaultOut = ''

      if (isNUp) defaultOut = `${baseName}_${nUpCount}up.pdf`
      else if (isPosterize) defaultOut = `${baseName}_poster_${posterRows}x${posterCols}.pdf`
      else if (isBooklet) defaultOut = `${baseName}_booklet.pdf`
      else if (isSanitize) defaultOut = `${baseName}_sanitized.pdf`
      else if (isCrop) defaultOut = `${baseName}_${cropMode}.pdf`

      const tempPath = await window.electronAPI.getTempPdfPath('imposition')
      let res: any

      if (isNUp) {
        res = await window.electronAPI.pdfNUp(activeTab.filePath, nUpCount, drawBorder, tempPath)
      } else if (isPosterize) {
        res = await window.electronAPI.pdfPosterize(activeTab.filePath, activeTab.currentPage, posterRows, posterCols, tempPath)
      } else if (isBooklet) {
        res = await window.electronAPI.pdfBooklet(activeTab.filePath, tempPath)
      } else if (isSanitize) {
        res = await window.electronAPI.pdfSanitize(activeTab.filePath, tempPath)
      } else if (isCrop) {
        res = await window.electronAPI.pdfCropOrMargin(
          activeTab.filePath,
          { top: cropTop, bottom: cropBottom, left: cropLeft, right: cropRight },
          cropMode,
          tempPath
        )
      }

      if (res.success && res.outputPath) {
        await useDocumentStore.getState().applyModifiedPDF(res.outputPath)
      } else {
        setErrorMsg(res.message || tr('处理遇到错误', 'Processing failed'))
      }
    } catch (e: any) {
      setErrorMsg(e.message || tr('操作异常', 'Operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 头部 */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-brand-950 text-brand-400 border border-brand-800/80">
              {isNUp && <Grid2X2 className="w-4 h-4" />}
              {isPosterize && <Maximize2 className="w-4 h-4" />}
              {isBooklet && <BookOpen className="w-4 h-4" />}
              {isSanitize && <ShieldCheck className="w-4 h-4" />}
              {isCrop && <Crop className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {isNUp && tr('N-Up 缩印拼版', 'N-Up Imposition')}
                {isPosterize && tr('海报拼图切片打印', 'Poster Tiling')}
                {isBooklet && tr('小册子骑马钉折页', 'Saddle-Stitch Booklet')}
                {isSanitize && tr('抹除元数据隐私', 'Remove Metadata')}
                {isCrop && tr('页面裁剪与白边扩展', 'Crop & Pad Margins')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isNUp && tr('将多页缩略并排至单页 A4 纸上', 'Place multiple pages side by side on a single A4 sheet')}
                {isPosterize && tr(`将第 ${activeTab.currentPage} 页切分为网格分块输出`, `Split page ${activeTab.currentPage} into a grid of tiles`)}
                {isBooklet && tr('自动补齐 4 倍数页并计算折页顺序', 'Pad to a multiple of 4 pages and compute fold order')}
                {isSanitize && tr('清除作者、创建工具、修改历史与隐藏 XMP 标签', 'Remove author, creator tool, revision history and hidden XMP tags')}
                {isCrop && tr('裁剪多余页边距或扩展外框空白', 'Trim page margins or add blank padding')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            aria-label={tr('关闭', 'Close')}
            title={tr('关闭', 'Close')}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容主体 */}
        <div className="p-5 space-y-4 text-xs">
          {/* N-Up 参数 */}
          {isNUp && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">{tr('单页容纳页数 (拼版规格)', 'Pages per sheet')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 2, label: tr('2-Up (横向双栏)', '2-Up (side by side)') },
                    { val: 4, label: tr('4-Up (2x2 网格)', '4-Up (2x2 grid)') },
                    { val: 9, label: tr('9-Up (3x3 网格)', '9-Up (3x3 grid)') }
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => setNUpCount(item.val as any)}
                      className={`py-2 px-3 rounded-lg border text-center font-medium transition-all ${
                        nUpCount === item.val
                          ? 'bg-brand-600 border-brand-500 text-white shadow-sm'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center space-x-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={drawBorder}
                  onChange={(e) => setDrawBorder(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-brand-600 focus:ring-0"
                />
                <span className="text-slate-300">{tr('为每个缩印页面绘制外围细灰线边框', 'Draw a thin gray border around each page')}</span>
              </label>
            </div>
          )}

          {/* Posterize 参数 */}
          {isPosterize && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{tr('切片行数', 'Rows')}</label>
                  <select
                    value={posterRows}
                    onChange={(e) => setPosterRows(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    <option value={2}>{tr('2 行', '2 rows')}</option>
                    <option value={3}>{tr('3 行', '3 rows')}</option>
                    <option value={4}>{tr('4 行', '4 rows')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{tr('切片列数', 'Columns')}</label>
                  <select
                    value={posterCols}
                    onChange={(e) => setPosterCols(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    <option value={2}>{tr('2 列', '2 columns')}</option>
                    <option value={3}>{tr('3 列', '3 columns')}</option>
                    <option value={4}>{tr('4 列', '4 columns')}</option>
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                {tr(
                  `将生成包含 ${posterRows * posterCols} 张标准 A4 的拼图文档，打印后沿边线拼接即可得到大幅海报。`,
                  `Generates ${posterRows * posterCols} standard A4 tiles. Print them and join along the edges to form a large poster.`
                )}
              </p>
            </div>
          )}

          {/* Booklet 提示 */}
          {isBooklet && (
            <div className="space-y-2 text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <p className="font-semibold text-brand-300">{tr('骑马钉对折手册排版说明：', 'How saddle-stitch booklets work:')}</p>
              <p className="text-[11px] leading-relaxed text-slate-400">
                {tr(
                  `当前文档共有 ${activeTab.pageCount} 页。算法将自动在末尾补充空白页使页数达到 4 的倍数（${Math.ceil(activeTab.pageCount / 4) * 4} 页），并将正反面交替拼版到横向 A4 页面上。`,
                  `This document has ${activeTab.pageCount} pages. Blank pages will be appended to reach a multiple of 4 (${Math.ceil(activeTab.pageCount / 4) * 4} pages), and front/back sides will be imposed onto landscape A4 sheets.`
                )}
              </p>
            </div>
          )}

          {/* Sanitize 提示 */}
          {isSanitize && (
            <div className="space-y-2 text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <p className="font-semibold text-emerald-400">{tr('将被抹除的隐私元数据：', 'Metadata that will be removed:')}</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                <li>{tr('文档标题、作者、主题与关键词', 'Title, author, subject and keywords')}</li>
                <li>{tr('制作软件 (Producer)、生成引擎 (Creator)', 'Producer and Creator')}</li>
                <li>{tr('创建与最后修改时间戳', 'Creation and modification timestamps')}</li>
                <li>{tr('XMP 隐藏元数据包与历史增量修订流', 'Hidden XMP metadata and incremental revision history')}</li>
                <li>{tr('JavaScript 脚本、打开时自动执行的动作', 'JavaScript and auto-run open actions')}</li>
                <li>{tr('嵌入附件、页面缩略图与私有应用数据 (PieceInfo)', 'Embedded attachments, page thumbnails and private app data (PieceInfo)')}</li>
              </ul>
              <p className="text-[11px] text-slate-500">{tr('正文内容、超链接、表单已填写的值与 OCR 隐形文字层会被保留。', 'Page content, hyperlinks, filled form values and invisible OCR text layers are kept.')}</p>
            </div>
          )}

          {/* Crop 参数 */}
          {isCrop && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCropMode('crop')}
                  className={`flex-1 py-1.5 rounded-lg border font-medium transition-all ${
                    cropMode === 'crop'
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {tr('裁剪边缘', 'Crop margins')}
                </button>
                <button
                  onClick={() => setCropMode('pad')}
                  className={`flex-1 py-1.5 rounded-lg border font-medium transition-all ${
                    cropMode === 'pad'
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {tr('增加外白边', 'Add padding')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">{tr('上边距 (pt)', 'Top (pt)')}</label>
                  <input
                    type="number"
                    value={cropTop}
                    onChange={(e) => setCropTop(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">{tr('下边距 (pt)', 'Bottom (pt)')}</label>
                  <input
                    type="number"
                    value={cropBottom}
                    onChange={(e) => setCropBottom(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">{tr('左边距 (pt)', 'Left (pt)')}</label>
                  <input
                    type="number"
                    value={cropLeft}
                    onChange={(e) => setCropLeft(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">{tr('右边距 (pt)', 'Right (pt)')}</label>
                  <input
                    type="number"
                    value={cropRight}
                    onChange={(e) => setCropRight(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100"
                  />
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {tr('取消', 'Cancel')}
          </button>
          <button
            disabled={isProcessing}
            onClick={handleExecute}
            className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors shadow-md disabled:opacity-40"
          >
            {isProcessing ? tr('正在处理...', 'Processing...') : tr('执行', 'Apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
