import React, { useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import { X, ShieldAlert, Sparkles, AlertTriangle, Check } from 'lucide-react'

export const RedactionDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const [patternType, setPatternType] = useState<'preset' | 'custom'>('preset')
  const [presetKey, setPresetKey] = useState<'@phone' | '@email' | '@idcard'>('@phone')
  const [customKeyword, setCustomKeyword] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const tr = useTr()
  const [fillColor, setFillColor] = useState<'black' | 'white'>('black')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successCount, setSuccessCount] = useState<number | null>(null)

  if (activeDialog !== 'redact' || !activeTab) return null

  const handleExecuteRedact = async () => {
    const raw = customKeyword.trim()
    if (patternType === 'custom' && !raw) {
      setErrorMsg(tr('请输入需要脱敏的关键词或正则表达式', 'Please enter a keyword or regular expression'))
      return
    }
    if (patternType === 'custom' && useRegex) {
      try {
        new RegExp(raw)
      } catch (e: any) {
        setErrorMsg(tr(`正则表达式无效：${e.message}`, `Invalid regular expression: ${e.message}`))
        return
      }
    }
    // 普通关键词模式下转义正则特殊字符，避免 “.”“(” 等被当作正则语法
    const pattern =
      patternType === 'preset' ? presetKey : useRegex ? raw : raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const defaultOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '_redacted.pdf')
    const savePath = await window.electronAPI.saveFileDialog({
      defaultPath: defaultOut
    })
    if (!savePath) return

    setIsProcessing(true)
    setErrorMsg('')
    setSuccessCount(null)

    const color = fillColor === 'black' ? [0, 0, 0] : [1, 1, 1]

    try {
      const res = await window.electronAPI.pythonRedact(
        activeTab.filePath,
        savePath,
        undefined, // 全文档扫描
        undefined,
        pattern,
        color
      )

      if (res.success) {
        const count = res.redactedCount ?? 0
        setSuccessCount(count)
        if (count > 0) {
          toast.success(tr(`已永久抹除 ${count} 处内容`, `Permanently removed ${count} match(es)`), savePath, savePath)
          setActiveDialog('none')
          await openDocument(savePath)
        } else {
          // 没有匹配项时不打开未改动的副本
          toast.info(tr('未找到匹配的内容', 'No matches found'), tr('文档未做任何修改', 'The document was not changed'))
        }
      } else {
        setErrorMsg(res.error || tr('物理脱敏失败', 'Redaction failed'))
      }
    } catch (err: any) {
      setErrorMsg(err.message || tr('操作异常', 'An error occurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-rose-500">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100">{tr('物理脱敏', 'True Redaction')}</h3>
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

        <div className="p-5 flex-1 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-300 text-[11px] leading-relaxed">
            <p className="font-semibold text-rose-200 mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              {tr('永久物理脱敏：', 'Permanent redaction:')}
            </p>
            {tr(
              '并非视觉遮挡。脱敏执行后，PDF 底层对应的文字、矢量图元和文本流会被删除，常规提取工具无法恢复。',
              'This is not a visual overlay. The underlying text, vector graphics and content streams are removed, so standard extraction tools cannot recover them.'
            )}
          </div>

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">{tr('脱敏匹配模式', 'Match Mode')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPatternType('preset')}
                className={`py-2 rounded-lg border font-medium transition-colors ${
                  patternType === 'preset'
                    ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tr('常见敏感隐私信息', 'Common personal data')}
              </button>
              <button
                onClick={() => setPatternType('custom')}
                className={`py-2 rounded-lg border font-medium transition-colors ${
                  patternType === 'custom'
                    ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tr('自定义关键词 / 正则', 'Custom keyword / regex')}
              </button>
            </div>
          </div>

          {patternType === 'preset' ? (
            <div className="space-y-1.5">
              <label className="block text-slate-400">{tr('选择敏感数据类型：', 'Select data type:')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: '@phone', label: tr('📱 手机号码', '📱 Phone numbers') },
                  { key: '@idcard', label: tr('🪪 身份证号', '🪪 ID numbers') },
                  { key: '@email', label: tr('✉️ 电子邮箱', '✉️ Email addresses') }
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setPresetKey(item.key as any)}
                    className={`py-1.5 rounded-lg border text-center font-medium transition-colors ${
                      presetKey === item.key
                        ? 'bg-rose-950 border-rose-500 text-rose-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-slate-400 mb-1">
                {tr('输入关键词或正则表达式：', 'Enter a keyword or regular expression:')}
              </label>
              <input
                type="text"
                value={customKeyword}
                onChange={(e) => setCustomKeyword(e.target.value)}
                placeholder={tr('例如：机密项目代号 或 银行账号正则', 'e.g. a project code name or a bank account regex')}
                aria-label={tr('关键词或正则表达式', 'Keyword or regular expression')}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-rose-500"
              />
              <label className="mt-2 flex items-center gap-2 text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(e) => setUseRegex(e.target.checked)}
                  className="accent-rose-500"
                />
                {tr('按正则表达式匹配（不勾选则按普通文字精确匹配）', 'Match as a regular expression (otherwise exact text)')}
              </label>
            </div>
          )}

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">{tr('脱敏区域填充颜色', 'Fill Color')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFillColor('black')}
                className={`py-1.5 rounded-lg border font-medium transition-colors flex items-center justify-center space-x-1.5 ${
                  fillColor === 'black'
                    ? 'bg-rose-950 border-rose-500 text-rose-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <span className="w-3.5 h-3.5 bg-black rounded-sm border border-slate-600 inline-block" />
                <span>{tr('黑色块遮蔽 (标准密件)', 'Black box (standard)')}</span>
              </button>
              <button
                onClick={() => setFillColor('white')}
                className={`py-1.5 rounded-lg border font-medium transition-colors flex items-center justify-center space-x-1.5 ${
                  fillColor === 'white'
                    ? 'bg-rose-950 border-rose-500 text-rose-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <span className="w-3.5 h-3.5 bg-white rounded-sm border border-slate-300 inline-block" />
                <span>{tr('白色抹除 (版面干净)', 'White fill (clean layout)')}</span>
              </button>
            </div>
          </div>

          {successCount !== null && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-900/60 rounded-xl text-emerald-300 flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>
                {tr(
                  `成功永久脱敏了 ${successCount} 处敏感文本，已为您打开新脱敏副本。`,
                  `Permanently redacted ${successCount} match(es). The redacted copy has been opened.`
                )}
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="text-rose-400 bg-rose-950/50 p-2.5 rounded-lg border border-rose-900/60">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            onClick={() => setActiveDialog('none')}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            {tr('关闭', 'Close')}
          </button>
          <button
            onClick={handleExecuteRedact}
            disabled={isProcessing}
            className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md transition-colors"
          >
            {isProcessing ? tr('正在抹除中...', 'Redacting...') : tr('开始全文档物理脱敏', 'Redact Entire Document')}
          </button>
        </div>
      </div>
    </div>
  )
}
