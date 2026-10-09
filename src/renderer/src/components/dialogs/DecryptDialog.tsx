import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { X, Unlock, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react'
import { useTr } from '../../i18n'

export const DecryptDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const tr = useTr()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [password, setPassword] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (activeDialog !== 'decrypt') return null

  const handleDecrypt = async () => {
    if (!activeTab) return

    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: activeTab.fileName.replace(/\.pdf$/i, '_unlocked.pdf')
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')

    try {
      const res = await window.electronAPI.pdfRemovePassword(activeTab.filePath, password, savePath)
      if (res.success && res.outputPath) {
        await openDocument(res.outputPath)
        setActiveDialog('none')
      } else {
        setErrorMsg(res.error || tr('解密失败，密码可能不正确', 'Decryption failed. The password may be incorrect.'))
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
          <div className="flex items-center space-x-2 text-emerald-400">
            <Unlock className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('移除密码', 'Remove Password')}</h3>
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
              '输入已知的文档密码后，将移除该 PDF 的打开密码与编辑权限限制，并另存为无密码文档。',
              'Enter the known password to remove the open password and editing restrictions, then save as an unprotected copy.'
            )}
          </p>

          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">{tr('文档密码：', 'Password:')}</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tr('输入密码（若仅有权限限制、无打开密码，可留空）', 'Enter password (leave blank if only permissions are restricted)')}
                aria-label={tr('文档密码', 'Password')}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
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
            onClick={handleDecrypt}
            disabled={isProcessing || !activeTab}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{tr('正在解密...', 'Decrypting...')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{tr('解密并另存', 'Decrypt & Save As')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
