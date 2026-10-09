import React, { useState, useEffect } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import {
  X,
  Info,
  ShieldCheck,
  Lock,
  Edit3,
  FileText,
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FolderOpen
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTr } from '../../i18n'

export const DocInfoDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const { t } = useTranslation()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [activeTabMode, setActiveTabMode] = useState<'view' | 'edit'>('view')

  // 编辑表单字段
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [subject, setSubject] = useState('')
  const [keywords, setKeywords] = useState('')
  const [creator, setCreator] = useState('')

  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (activeTab?.metadata) {
      setTitle(activeTab.metadata.title || '')
      setAuthor(activeTab.metadata.author || '')
      setSubject(activeTab.metadata.subject || '')
      setKeywords((activeTab.metadata.keywords || []).join('; '))
      setCreator(activeTab.metadata.creator || '')
    }
  }, [activeTab?.id, activeTab?.metadata])

  if (activeDialog !== 'info' || !activeTab) return null

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const meta = activeTab.metadata

  // 一键清空隐私
  const handleWipePrivacy = async () => {
    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: activeTab.fileName.replace(/\.pdf$/i, '_sanitized.pdf')
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await window.electronAPI.pdfSanitize(activeTab.filePath, savePath)
      if (res.success && res.outputPath) {
        setSuccessMsg(tr('已抹除作者、制作工具、时间戳与隐藏元数据标签。', 'Author, creator tool, timestamps and hidden metadata tags have been removed.'))
        await openDocument(res.outputPath)
      } else {
        setErrorMsg(res.message || tr('抹除元数据失败', 'Failed to remove metadata'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('操作异常', 'Operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  // 保存修改的元数据
  const handleSaveMetadata = async () => {
    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: activeTab.fileName.replace(/\.pdf$/i, '_meta_updated.pdf')
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')
    setSuccessMsg('')

    const kwList = keywords
      .split(/[,;，；]/)
      .map((k) => k.trim())
      .filter(Boolean)

    try {
      const res = await window.electronAPI.pdfUpdateMetadata(
        activeTab.filePath,
        {
          title: title.trim(),
          author: author.trim(),
          subject: subject.trim(),
          keywords: kwList,
          creator: creator.trim()
        },
        savePath
      )

      if (res.success && res.outputPath) {
        setSuccessMsg(tr('文档元数据已更新并保存。', 'Document metadata updated and saved.'))
        await openDocument(res.outputPath)
      } else {
        setErrorMsg(res.message || tr('更新元数据失败', 'Failed to update metadata'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('操作异常', 'Operation failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* 顶部标签栏 */}
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTabMode('view')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                activeTabMode === 'view'
                  ? 'bg-brand-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{tr('属性概览', 'Overview')}</span>
            </button>
            <button
              onClick={() => setActiveTabMode('edit')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                activeTabMode === 'edit'
                  ? 'bg-brand-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{tr('编辑元数据', 'Edit Metadata')}</span>
            </button>
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
        <div className="p-5 flex-1 space-y-3.5 text-xs max-h-[65vh] overflow-y-auto">
          {activeTabMode === 'view' ? (
            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">{tr('文件名称', 'File name')}</span>
                <span className="text-slate-200 font-semibold truncate max-w-[280px]">
                  {activeTab.fileName}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">{tr('存储路径', 'Location')}</span>
                <span
                  className="text-slate-300 font-mono text-[11px] truncate max-w-[280px]"
                  title={activeTab.filePath}
                >
                  {activeTab.filePath}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">{tr('页面总数', 'Pages')}</span>
                <span className="text-brand-400 font-mono font-semibold">{tr(`${activeTab.pageCount} 页`, `${activeTab.pageCount} pages`)}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">{tr('文件大小', 'File size')}</span>
                <span className="text-slate-200 font-mono">{formatSize(meta.fileSize)}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">{tr('标题', 'Title')}</span>
                <span className="text-slate-200 truncate max-w-[280px]">
                  {meta.title || <span className="text-slate-500 italic">{tr('（未设置）', '(not set)')}</span>}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">{tr('作者', 'Author')}</span>
                <span className="text-slate-200 truncate max-w-[280px]">
                  {meta.author || <span className="text-slate-500 italic">{tr('（未设置）', '(not set)')}</span>}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">{tr('制作工具', 'Creator')}</span>
                <span className="text-slate-200 truncate max-w-[280px]">
                  {meta.creator || <span className="text-slate-500 italic">{tr('（未设置）', '(not set)')}</span>}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800/80">
                <span className="text-slate-400">{tr('安全状态', 'Security')}</span>
                <span className="flex items-center space-x-1.5">
                  {meta.isEncrypted ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-400 font-medium">{tr('已启用密码与权限加密', 'Password and permission encryption enabled')}</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">{tr('无密码保护 (可直接编辑)', 'Not password protected (editable)')}</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400">
                {tr('在此直接修改当前 PDF 的标准元数据属性，保存时将写入规范的 Info 字典。', 'Edit the standard metadata of this PDF. Changes are written to the Info dictionary on save.')}
              </p>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">{tr('文档标题', 'Title')}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr('例如：2026 年度企业财报', 'e.g. 2026 Annual Financial Report')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">{tr('作者 / 责任人', 'Author')}</label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder={tr('例如：财务审计部 张三', 'e.g. Finance Audit Team')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">{tr('文档主题', 'Subject')}</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={tr('例如：审计复核报告与决算汇总', 'e.g. Audit review and final accounts summary')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">
                  {tr('关键词（多个请用分号分隔）', 'Keywords (separate with semicolons)')}
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder={tr('例如：财报; 审计; 2026', 'e.g. report; audit; 2026')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">{tr('制作工具署名', 'Creator')}</label>
                <input
                  type="text"
                  value={creator}
                  onChange={(e) => setCreator(e.target.value)}
                  placeholder={tr('例如：PDFOpen Studio', 'e.g. PDFOpen Studio')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-brand-500 font-mono text-[11px]"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-900/60 text-red-300 flex items-center space-x-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-900/60 text-emerald-300 flex items-center space-x-2 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <button
            onClick={handleWipePrivacy}
            disabled={isProcessing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800 text-rose-300 text-xs font-medium transition-colors"
            title={tr('清除作者、创建工具、时间戳及 XMP 隐藏包', 'Remove author, creator tool, timestamps and hidden XMP data')}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{tr('抹除隐私信息', 'Sanitize')}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveDialog('none')}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            >
              {tr('关闭', 'Close')}
            </button>
            {activeTabMode === 'edit' && (
              <button
                onClick={handleSaveMetadata}
                disabled={isProcessing}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{tr('保存元数据', 'Save Metadata')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
