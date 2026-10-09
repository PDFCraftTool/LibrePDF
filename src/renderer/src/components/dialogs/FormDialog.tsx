import React, { useState, useEffect } from 'react'
import { useDocumentStore, cleanIpcError } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { X, CheckSquare, Lock, Save, AlertCircle } from 'lucide-react'
import { useTr } from '../../i18n'

export const FormDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  const [fields, setFields] = useState<{ name: string; type: string; value?: string }[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (activeDialog === 'form' && activeTab) {
      setIsLoading(true)
      setMsg('')
      setFields([])
      setFieldValues({})
      window.electronAPI
        .pdfGetFormFields(activeTab.filePath)
        .then((res) => {
          if (res.success && res.fields) {
            setFields(res.fields)
            const initValues: Record<string, string> = {}
            res.fields.forEach((f) => {
              initValues[f.name] = f.value || ''
            })
            setFieldValues(initValues)
          } else if (!res.success) {
            const detail = res.error || tr('未知错误', 'Unknown error')
            setMsg(tr(`读取表单失败：${detail}`, `Failed to read form: ${detail}`))
          }
        })
        .catch((err) => {
          const detail = cleanIpcError(err)
          setMsg(tr(`读取表单失败：${detail}`, `Failed to read form: ${detail}`))
        })
        .finally(() => setIsLoading(false))
    }
  }, [activeDialog, activeTab?.id])

  if (activeDialog !== 'form' || !activeTab) return null

  // 默认输出到原文件所在目录（工作副本位于临时目录，不适合作为默认保存位置）
  const sourcePath = activeTab.originalFilePath || activeTab.filePath

  const runAndOpen = async (
    suffix: string,
    action: (savePath: string) => Promise<{ success: boolean; message?: string; error?: string }>,
    successText: string
  ) => {
    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: sourcePath.replace(/\.pdf$/i, suffix)
    })
    if (!savePath) return

    setIsProcessing(true)
    setMsg('')
    try {
      const res = await action(savePath)
      if (res.success) {
        toast.success(successText, savePath, savePath)
        setActiveDialog('none')
        await openDocument(savePath)
      } else {
        setMsg(res.error || res.message || tr('操作失败', 'Operation failed'))
      }
    } catch (err) {
      setMsg(cleanIpcError(err) || tr('操作异常', 'An error occurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSaveFields = () =>
    runAndOpen(
      '_form_filled.pdf',
      (savePath) => window.electronAPI.pdfFillFormFields(activeTab.filePath, fieldValues, savePath),
      tr('表单填写已保存', 'Form data saved')
    )

  const handleFlatten = () =>
    runAndOpen(
      '_form_flattened.pdf',
      (savePath) => window.electronAPI.pdfFlattenForm(activeTab.filePath, savePath),
      tr('表单已扁平化锁定', 'Form flattened')
    )

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-amber-400">
            <CheckSquare className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('AcroForms 交互式表单', 'AcroForms Interactive Forms')}</h3>
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
          {isLoading ? (
            <div className="py-12 text-center text-slate-400">{tr('正在分析文档表单控件...', 'Analyzing form fields...')}</div>
          ) : fields.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
              <p>
                {tr(
                  '当前 PDF 文档中未检测到标准的交互式 AcroForms 表单控件。',
                  'No interactive AcroForms fields were found in this PDF.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <span className="text-slate-400 font-medium">
                {tr(`检测到 ${fields.length} 个交互式表单域：`, `Found ${fields.length} form field(s):`)}
              </span>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {fields.map((f) => (
                  <div key={f.name} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span className="font-mono text-amber-400/90">{f.name}</span>
                      <span className="text-[10px] text-slate-500">{f.type}</span>
                    </div>
                    {f.type.toLowerCase().includes('check') ? (
                      <label className="flex items-center space-x-2 cursor-pointer mt-1">
                        <input
                          type="checkbox"
                          checked={fieldValues[f.name] === 'true'}
                          onChange={(e) =>
                            setFieldValues((prev) => ({ ...prev, [f.name]: e.target.checked ? 'true' : 'false' }))
                          }
                          className="accent-amber-500"
                        />
                        <span className="text-slate-300">{tr('勾选此复选框', 'Checked')}</span>
                      </label>
                    ) : (
                      <input
                        type="text"
                        value={fieldValues[f.name] || ''}
                        onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 text-xs focus:outline-none focus:border-amber-500"
                        placeholder={tr('输入表单内容...', 'Enter value...')}
                        aria-label={f.name}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {msg && (
            <div className="p-2.5 bg-emerald-950/50 border border-emerald-900/60 rounded-xl text-emerald-300 text-[11px]">
              {msg}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={handleFlatten}
            disabled={isProcessing || fields.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-300 text-xs font-medium border border-amber-900/40 transition-colors"
            title={tr(
              '将表单所有控件与填写内容锁定为不可编辑的静态内容',
              'Convert all form fields and their values into static, non-editable content'
            )}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{tr('表单扁平化锁定', 'Flatten Form')}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveDialog('none')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            >
              {tr('关闭', 'Close')}
            </button>
            <button
              onClick={handleSaveFields}
              disabled={isProcessing || fields.length === 0}
              className="flex items-center space-x-1 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{tr('保存表单', 'Save Form')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
