import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import { X, FileCode, Image as ImageIcon, Copy, Check, FolderOpen, Save } from 'lucide-react'

export const PopplerDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  const [extractedText, setExtractedText] = useState('')
  const [extractedImages, setExtractedImages] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasCopied, setHasCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isTextMode = activeDialog === 'popplerText'
  const isImageMode = activeDialog === 'popplerImages'

  if (!isTextMode && !isImageMode) return null
  if (!activeTab) return null

  const handleExtractText = async () => {
    setIsLoading(true)
    setErrorMsg('')
    try {
      const res = await window.electronAPI.popplerExtractText(activeTab.filePath, { layout: true })
      if (res.success && res.text) {
        setExtractedText(res.text)
      } else {
        setErrorMsg(res.error || tr('Poppler 提取失败，请检查是否已内置该程序', 'Poppler extraction failed. Check that Poppler is bundled.'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('执行异常', 'Execution failed'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleExtractImages = async () => {
    setIsLoading(true)
    setErrorMsg('')
    try {
      // 让用户选择导出文件夹（工作副本可能位于临时目录，不适合作为默认位置）
      const dirs = await window.electronAPI.openFileDialog({ openDirectory: true })
      if (!dirs?.[0]) return
      const baseName = (activeTab.fileName || 'document').replace(/\.pdf$/i, '')
      const sep = dirs[0].includes('\\') ? '\\' : '/'
      const outDir = `${dirs[0]}${sep}${baseName}_images`
      const res = await window.electronAPI.popplerExtractImages(activeTab.filePath, outDir)
      if (res.success && res.imagePaths) {
        setExtractedImages(res.imagePaths)
        toast.success(tr(`已导出 ${res.imagePaths.length} 张图片`, `Exported ${res.imagePaths.length} image(s)`), outDir, outDir)
      } else {
        setErrorMsg(res.error || tr('提取图片失败', 'Failed to extract images'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('执行异常', 'Execution failed'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(extractedText)
      setHasCopied(true)
      setTimeout(() => setHasCopied(false), 2000)
    } catch {
      toast.error(tr('复制失败', 'Copy failed'))
    }
  }

  // 将提取的文本另存为 .txt 文件
  const handleSaveText = async () => {
    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '.txt'),
      filters: [{ name: tr('文本文件', 'Text file'), extensions: ['txt'] }]
    })
    if (!savePath) return
    const res = await window.electronAPI.writeTextFile(savePath, extractedText)
    if (res.success) toast.success(tr('文本已保存', 'Text saved'), savePath, savePath)
    else toast.error(tr('保存失败', 'Save failed'), res.error)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-teal-400">
            {isTextMode ? <FileCode className="w-5 h-5" /> : <ImageIcon className="w-5 h-5 text-orange-400" />}
            <h3 className="font-bold text-sm text-slate-100">
              {isTextMode
                ? tr('Poppler 保留版面文字提取', 'Poppler Layout-Preserving Text Extraction')
                : tr('Poppler 内嵌原图导出', 'Poppler Embedded Image Export')}
            </h3>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            aria-label={tr('关闭', 'Close')}
            title={tr('关闭', 'Close')}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">
              {tr('目标文档：', 'Document: ')}<span className="text-slate-200 font-mono">{activeTab.fileName}</span>
            </span>

            {isTextMode ? (
              <div className="flex items-center space-x-2">
                {extractedText && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    {hasCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{hasCopied ? tr('已复制', 'Copied') : tr('复制全文', 'Copy all')}</span>
                  </button>
                )}
                {extractedText && (
                  <button
                    onClick={handleSaveText}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{tr('保存为 .txt', 'Save as .txt')}</span>
                  </button>
                )}
                <button
                  onClick={handleExtractText}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-medium shadow-sm transition-colors"
                >
                  {isLoading ? tr('正在提取...', 'Extracting...') : tr('开始提取', 'Extract')}
                </button>
              </div>
            ) : (
              <button
                onClick={handleExtractImages}
                disabled={isLoading}
                className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-medium shadow-sm transition-colors"
              >
                {isLoading ? tr('正在导出...', 'Exporting...') : tr('导出全部图片', 'Export all images')}
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="text-rose-400 bg-rose-950/50 p-2.5 rounded-lg border border-rose-900/60">
              {errorMsg}
            </div>
          )}

          {isTextMode && (
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 min-h-[300px] max-h-[450px] overflow-auto font-mono text-slate-300 whitespace-pre leading-relaxed select-text">
              {extractedText || (
                <div className="text-slate-600 text-center py-20">
                  {tr(
                    '点击右上角“开始提取”，Poppler 将保留多栏与表格版面输出文字',
                    'Click "Extract" to output text while preserving multi-column and table layouts'
                  )}
                </div>
              )}
            </div>
          )}

          {isImageMode && (
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 min-h-[260px] max-h-[450px] overflow-auto">
              {extractedImages.length === 0 ? (
                <div className="text-slate-600 text-center py-20">
                  {tr(
                    '点击“导出全部图片”，无需重新渲染，直接以原始质量提取 PDF 内嵌的图像',
                    'Click "Export all images" to extract embedded images at their original quality, without re-rendering'
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-emerald-400 font-semibold mb-3">
                    {tr(
                      `已导出 ${extractedImages.length} 张图像，保存在同名图片文件夹中。`,
                      `Exported ${extractedImages.length} image(s) to a folder named after the document.`
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {extractedImages.map((imgPath, idx) => (
                      <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] truncate text-slate-300">
                        {imgPath.split(/[/\\]/).pop()}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
