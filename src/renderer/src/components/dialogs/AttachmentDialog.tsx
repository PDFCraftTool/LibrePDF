import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { X, Paperclip, FileUp, Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { useTr } from '../../i18n'

export const AttachmentDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  if (activeDialog !== 'attachments') return null

  const handleAddAttachment = async () => {
    if (!activeTab) return

    const selectFiles = await window.electronAPI.openFileDialog({
      multiSelections: false,
      filters: [{ name: tr('所有文件', 'All Files'), extensions: ['*'] }]
    })
    if (!selectFiles || selectFiles.length === 0) return

    const attachFile = selectFiles[0]

    setIsProcessing(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      // 写入工作副本并应用到当前标签，由用户决定保存位置（Ctrl+S / 另存为）
      const tempPath = await window.electronAPI.getTempPdfPath('attachment')
      const res = await window.electronAPI.pdfAddAttachment(activeTab.filePath, attachFile, tempPath)
      if (res.success && res.outputPath) {
        await useDocumentStore.getState().applyModifiedPDF(res.outputPath, { silent: true })
        toast.success(
          tr(`附件“${res.fileName}”已嵌入`, `Attachment "${res.fileName}" embedded`),
          tr('按 Ctrl+S 保存到原文件，或使用“另存为”', 'Press Ctrl+S to save to the original file, or use Save As')
        )
      } else {
        setErrorMsg(res.error || tr('嵌入附件失败', 'Failed to embed attachment'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('操作异常', 'Operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExportAttachments = async () => {
    if (!activeTab) return

    // 选取导出目标目录（此前误用了“保存文件”对话框）
    const dirs = await window.electronAPI.openFileDialog({ openDirectory: true })
    const targetDir = dirs?.[0]
    if (!targetDir) return

    setIsProcessing(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await window.electronAPI.pdfExtractAttachments(activeTab.filePath, targetDir)
      if (res.success) {
        setSuccessMsg(tr(`已导出 ${res.count} 个内嵌附件到指定目录`, `Exported ${res.count} embedded attachment(s) to the selected folder`))
        toast.success(tr(`已导出 ${res.count} 个附件`, `Exported ${res.count} attachment(s)`), targetDir, targetDir)
      } else {
        setErrorMsg(res.error || tr('导出附件失败，文档可能不包含附件', 'Failed to export attachments. The document may not contain any.'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('操作异常', 'Operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-purple-400">
            <Paperclip className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('PDF 附件嵌入与导出', 'PDF Attachments')}</h3>
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
          <p className="text-slate-400">
            {tr(
              '可将任意外部文件（ZIP、CAD 图纸、Word、XML 等）作为附件嵌入 PDF，或将文档中已有的附件原样导出。',
              'Embed any external file (ZIP, CAD drawings, Word, XML, etc.) into the PDF as an attachment, or export existing attachments unchanged.'
            )}
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleAddAttachment}
              disabled={isProcessing || !activeTab}
              className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-purple-500 text-slate-200 flex flex-col items-center justify-center space-y-2 transition-all group"
            >
              <FileUp className="w-6 h-6 text-purple-400 group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-xs">{tr('嵌入新附件', 'Embed attachment')}</span>
              <span className="text-[10px] text-slate-500">{tr('向当前 PDF 添加附件', 'Add a file to the current PDF')}</span>
            </button>

            <button
              onClick={handleExportAttachments}
              disabled={isProcessing || !activeTab}
              className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500 text-slate-200 flex flex-col items-center justify-center space-y-2 transition-all group"
            >
              <Download className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-xs">{tr('导出全部附件', 'Export all attachments')}</span>
              <span className="text-[10px] text-slate-500">{tr('提取文档中的所有附件', 'Extract every embedded file')}</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={() => setActiveDialog('none')}
            className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {tr('关闭', 'Close')}
          </button>
        </div>
      </div>
    </div>
  )
}
