import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, Images, FolderOpen, CheckCircle2, AlertCircle, FileImage, Sparkles, Layers } from 'lucide-react'
import { useTr } from '../../i18n'

export const PdfToImageDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  const [format, setFormat] = useState<'png' | 'jpg' | 'webp' | 'tiff'>('png')
  const [dpi, setDpi] = useState<number>(200)
  const [pageScope, setPageScope] = useState<'all' | 'current' | 'custom'>('all')
  const [customPages, setCustomPages] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [successMsg, setSuccessMsg] = useState<string>('')

  if (activeDialog !== 'pdfToImage' || !activeTab) return null

  const handleExport = async () => {
    setErrorMsg('')
    setSuccessMsg('')

    // 解析页码范围
    let pagesToRender: number[] | undefined = undefined
    if (pageScope === 'current') {
      pagesToRender = [activeTab.currentPage]
    } else if (pageScope === 'custom') {
      const parts = customPages.split(/[,，\s]+/).filter(Boolean)
      const parsed: number[] = []
      for (const p of parts) {
        if (p.includes('-')) {
          const [startStr, endStr] = p.split('-')
          const s = parseInt(startStr, 10)
          const e = parseInt(endStr, 10)
          if (!isNaN(s) && !isNaN(e)) {
            for (let i = Math.min(s, e); i <= Math.max(s, e); i++) {
              if (i >= 1 && i <= activeTab.pageCount && !parsed.includes(i)) {
                parsed.push(i)
              }
            }
          }
        } else {
          const num = parseInt(p, 10)
          if (!isNaN(num) && num >= 1 && num <= activeTab.pageCount && !parsed.includes(num)) {
            parsed.push(num)
          }
        }
      }
      if (parsed.length === 0) {
        setErrorMsg(
          tr(
            `请输入有效的页码范围（1 ~ ${activeTab.pageCount}）`,
            `Please enter a valid page range (1 - ${activeTab.pageCount})`
          )
        )
        return
      }
      pagesToRender = parsed.sort((a, b) => a - b)
    }

    const dirRes = await window.electronAPI.openFileDialog({
      openDirectory: true
    })
    if (!dirRes || dirRes.length === 0) return
    const outputDir = dirRes[0]

    setIsProcessing(true)

    try {
      const res = await window.electronAPI.pdfToImages(activeTab.filePath, outputDir, {
        format,
        dpi,
        pages: pagesToRender
      })

      if (res.success && res.outputFiles) {
        const count = res.count || res.outputFiles.length
        setSuccessMsg(
          tr(
            `导出成功！已将 ${count} 个页面渲染为 ${format.toUpperCase()} 图像，保存在：${outputDir}`,
            `Export complete. Rendered ${count} page(s) as ${format.toUpperCase()} images, saved to: ${outputDir}`
          )
        )
      } else {
        setErrorMsg(res.error || tr('导出图片失败', 'Failed to export images'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('导出图片发生异常', 'An error occurred while exporting images'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-rose-400">
            <FileImage className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('PDF 逐页导出为图片', 'Export PDF Pages as Images')}</h3>
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

        {/* 主体设置 */}
        <div className="p-5 space-y-4">
          {/* 图像格式 */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {tr('输出格式', 'Image Format')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'png', name: 'PNG', desc: tr('无损/支持透明', 'Lossless, transparency') },
                { id: 'jpg', name: 'JPG', desc: tr('通用/高压缩比', 'Universal, compact') },
                { id: 'webp', name: 'WebP', desc: tr('现代网络格式', 'Modern web format') },
                { id: 'tiff', name: 'TIFF', desc: tr('无损归档', 'Lossless archive') }
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id as any)}
                  className={`px-3 py-2 rounded-xl border text-center transition-all ${
                    format === f.id
                      ? 'bg-rose-500/10 border-rose-500 text-rose-400 shadow-sm'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <div className="text-sm font-bold">{f.name}</div>
                  <div className="text-[10px] opacity-75">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 渲染分辨率 DPI */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {tr('清晰度 / 渲染分辨率 (DPI)', 'Resolution (DPI)')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { dpi: 72, label: '72 DPI', desc: tr('快览轻量', 'Quick preview') },
                { dpi: 150, label: '150 DPI', desc: tr('均衡快速', 'Balanced') },
                { dpi: 200, label: '200 DPI', desc: tr('标准高清', 'Standard HD') },
                { dpi: 300, label: '300 DPI', desc: tr('出版印刷', 'Print quality') }
              ].map((d) => (
                <button
                  key={d.dpi}
                  type="button"
                  onClick={() => setDpi(d.dpi)}
                  className={`px-3 py-2 rounded-xl border text-center transition-all ${
                    dpi === d.dpi
                      ? 'bg-rose-500/10 border-rose-500 text-rose-400 shadow-sm'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-bold">{d.label}</div>
                  <div className="text-[10px] opacity-75">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 导出范围 */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {tr('页面导出范围', 'Page Range')}
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                {
                  id: 'all',
                  label: tr(`全部页面 (${activeTab.pageCount}页)`, `All pages (${activeTab.pageCount})`)
                },
                {
                  id: 'current',
                  label: tr(`当前页 (第${activeTab.currentPage}页)`, `Current page (${activeTab.currentPage})`)
                },
                { id: 'custom', label: tr('自定义页码', 'Custom pages') }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPageScope(s.id as any)}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                    pageScope === s.id
                      ? 'bg-rose-500/10 border-rose-500 text-rose-400 shadow-sm'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {pageScope === 'custom' && (
              <input
                type="text"
                value={customPages}
                onChange={(e) => setCustomPages(e.target.value)}
                placeholder={tr('例如: 1-3, 5, 8 (用逗号分隔)', 'e.g. 1-3, 5, 8 (comma separated)')}
                aria-label={tr('自定义页码', 'Custom pages')}
                className="w-full px-3 py-2 text-xs bg-slate-950/60 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            )}
          </div>

          {/* 状态提示 */}
          {errorMsg && (
            <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-950/30 border border-red-900/50 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 p-3 rounded-xl">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {tr('支持 JPG、PNG、WebP、TIFF 输出', 'Outputs JPG, PNG, WebP and TIFF')}
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveDialog('none')}
              className="px-4 py-1.5 rounded-xl border border-slate-700 text-slate-300 text-xs hover:bg-slate-800 transition-colors"
            >
              {tr('关闭', 'Close')}
            </button>
            <button
              onClick={handleExport}
              disabled={isProcessing}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-medium transition-all shadow-md disabled:opacity-50"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>
                {isProcessing
                  ? tr('正在逐页渲染...', 'Rendering pages...')
                  : tr('选择目标文件夹并导出', 'Choose Folder & Export')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
