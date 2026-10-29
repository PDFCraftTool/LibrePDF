import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, Globe, Code, CheckCircle2, AlertCircle, FileDown } from 'lucide-react'
import { useTr } from '../../i18n'

export const HtmlToPdfDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, openDocument } = useDocumentStore()
  const tr = useTr()

  const [mode, setMode] = useState<'url' | 'html'>('url')
  const [url, setUrl] = useState('https://')
  const [htmlContent, setHtmlContent] = useState('<h1>Hello LibrePDF Studio</h1>\n<p>Native Chromium Webpage to PDF</p>')
  const [pageSize, setPageSize] = useState<'A4' | 'A3' | 'Letter'>('A4')
  const [landscape, setLandscape] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (activeDialog !== 'htmlToPdf') return null

  const handleConvert = async () => {
    if (mode === 'url' && (!url || url === 'https://')) {
      setErrorMsg(tr('请输入有效的 HTTP / HTTPS 网页地址', 'Please enter a valid HTTP / HTTPS URL'))
      return
    }
    if (mode === 'html' && !htmlContent.trim()) {
      setErrorMsg(tr('请输入有效的 HTML 代码内容', 'Please enter some HTML content'))
      return
    }

    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: mode === 'url' ? 'webpage_export.pdf' : 'html_render.pdf'
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')

    try {
      const source = mode === 'url' ? { url } : { html: htmlContent }
      const res = await window.electronAPI.htmlToPdf(source, savePath, {
        pageSize,
        landscape,
        printBackground: true
      })

      if (res.success && res.outputPath) {
        await openDocument(res.outputPath)
        setActiveDialog('none')
      } else {
        setErrorMsg(res.error || tr('网页转换失败', 'Webpage conversion failed'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('转换过程发生异常', 'An error occurred during conversion'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-blue-400">
            <Globe className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('网页 / HTML 转 PDF', 'Webpage / HTML to PDF')}</h3>
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

        <div className="p-5 flex-1 space-y-4 text-xs">
          {/* 模式切换 */}
          <div className="flex rounded-xl bg-slate-950/60 p-1 border border-slate-800">
            <button
              onClick={() => setMode('url')}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center space-x-1.5 ${
                mode === 'url' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{tr('网址 URL 转换', 'From URL')}</span>
            </button>
            <button
              onClick={() => setMode('html')}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center space-x-1.5 ${
                mode === 'html' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>{tr('HTML 代码渲染', 'From HTML Code')}</span>
            </button>
          </div>

          {mode === 'url' ? (
            <div className="space-y-1.5">
              <label htmlFor="html-to-pdf-url" className="text-slate-300 font-medium">
                {tr('目标网页网址 (URL):', 'Webpage URL:')}
              </label>
              <input
                id="html-to-pdf-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-[11px] text-slate-500">
                {tr(
                  '基于内置 Chromium 引擎离屏渲染，保留 CSS 样式、Web 字体与矢量排版。',
                  'Rendered offscreen by the built-in Chromium engine, preserving CSS styles, web fonts and vector layout.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="html-to-pdf-source" className="text-slate-300 font-medium">
                {tr('输入 HTML 源码:', 'HTML source:')}
              </label>
              <textarea
                id="html-to-pdf-source"
                rows={6}
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
              />
            </div>
          )}

          {/* 规格设置 */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label htmlFor="html-to-pdf-size" className="text-slate-400">{tr('纸张规格:', 'Paper size:')}</label>
              <select
                id="html-to-pdf-size"
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
              >
                <option value="A4">{tr('A4 标准规格', 'A4')}</option>
                <option value="A3">{tr('A3 大图幅规格', 'A3')}</option>
                <option value="Letter">{tr('US Letter 规格', 'US Letter')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="html-to-pdf-orientation" className="text-slate-400">
                {tr('画幅方向:', 'Orientation:')}
              </label>
              <select
                id="html-to-pdf-orientation"
                value={landscape ? 'true' : 'false'}
                onChange={(e) => setLandscape(e.target.value === 'true')}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
              >
                <option value="false">{tr('纵向', 'Portrait')}</option>
                <option value="true">{tr('横向', 'Landscape')}</option>
              </select>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
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
            onClick={handleConvert}
            disabled={isProcessing}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{tr('渲染转换中...', 'Converting...')}</span>
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5" />
                <span>{tr('生成 PDF', 'Generate PDF')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
