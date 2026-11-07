import React, { useEffect, useRef, useState } from 'react'
import { useAIStore } from '../../stores/useAIStore'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { useTranslation } from 'react-i18next'
import { useTr } from '../../i18n'
import { getWelcomeMessage } from '../../stores/useAIStore'
import {
  X,
  Send,
  Bot,
  User,
  ShieldCheck,
  CheckCircle,
  Play,
  RotateCcw,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  FileSearch
} from 'lucide-react'

export const AICopilotDrawer: React.FC = () => {
  const { t } = useTranslation()
  const { setCurrentPage } = useDocumentStore()
  const {
    isOpen,
    setOpen,
    isOllamaOnline,
    availableModels,
    config,
    messages,
    isGenerating,
    isCheckingStatus,
    checkOllama,
    sendMessage,
    approveAction,
    rejectAction,
    clearMessages,
    setModel
  } = useAIStore()
  const tr = useTr()

  const [inputVal, setInputVal] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      checkOllama()
    }
  }, [isOpen, checkOllama])

  // 新消息或状态变化时自动滚动到底部
  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [isOpen, messages, isGenerating])

  if (!isOpen) return null

  const handleSend = () => {
    if (!inputVal.trim() || isGenerating) return
    sendMessage(inputVal.trim())
    setInputVal('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col h-full shadow-lg z-30 select-none">
      {/* 头部状态与标题 */}
      <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-600">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              {t('copilot.title')}
              <span className="text-[10px] text-blue-600 font-mono font-medium">Agent</span>
            </h3>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isOllamaOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {isOllamaOnline && availableModels.length > 0 ? (
                // 模型选择器：选择会被记住
                <select
                  value={config.model}
                  onChange={(e) => setModel(e.target.value)}
                  aria-label={tr('选择本地模型', 'Choose local model')}
                  className="text-[10px] bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-700 max-w-[170px] focus:outline-none focus:border-blue-500 shadow-2xs"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      Ollama · {m}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[10px] text-slate-500">
                  {isOllamaOnline ? `Ollama (${config.model})` : tr('离线规则引擎（未检测到 Ollama）', 'Offline rule engine (Ollama not found)')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              disabled={isGenerating}
              className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-40 transition-colors"
              title={tr('清空对话', 'Clear chat')}
              aria-label={tr('清空对话', 'Clear chat')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={checkOllama}
            disabled={isCheckingStatus}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
            title={tr('重新检测 Ollama 服务', 'Recheck Ollama service')}
            aria-label={tr('重新检测 Ollama 服务', 'Recheck Ollama service')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
            title={tr('关闭', 'Close')}
            aria-label={tr('关闭 AI 助手', 'Close AI assistant')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 消息与审查卡片流 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs bg-[#f8fafc]">
        {messages.map((msg) => {
          const isUser = msg.role === 'user'
          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center space-x-1.5 mb-1 text-[10px] text-slate-400">
                {isUser ? (
                  <>
                    <span>{tr('你', 'You')}</span>
                    <User className="w-3 h-3 text-slate-400" />
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-blue-600" />
                    <span className="font-medium text-slate-600">LibrePDF Agent</span>
                  </>
                )}
              </div>

              <div
                className={`max-w-[90%] rounded-xl p-3 leading-relaxed shadow-xs ${
                  isUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-800 border border-slate-200'
                }`}
              >
                {msg.id === 'welcome' ? getWelcomeMessage() : msg.content}

                {/* 智能体规划的原子操作卡片与隐私审查 */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-blue-700">
                      <span>{tr(`待确认操作 (${msg.actions.length})`, `Pending operations (${msg.actions.length})`)}</span>
                      <span className="flex items-center text-[10px] text-emerald-600 gap-1 font-medium">
                        <ShieldCheck className="w-3 h-3" />
                        {tr('本地处理', 'Processed locally')}
                      </span>
                    </div>

                    {msg.actions.map((act) => (
                      <div
                        key={act.id}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <span className="font-semibold text-slate-800">{act.title}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                              act.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : act.status === 'executing'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                                : 'bg-slate-200/80 text-slate-700'
                            }`}
                          >
                            {
                              {
                                pending: tr('待确认', 'Pending'),
                                reviewing: tr('审查中', 'Reviewing'),
                                executing: tr('执行中', 'Running'),
                                completed: tr('已完成', 'Done'),
                                failed: tr('未执行', 'Not run')
                              }[act.status] ?? act.status
                            }
                          </span>
                        </div>

                        {act.sanitizedSummary && (
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {act.sanitizedSummary}
                          </p>
                        )}

                        {/* 会改写文档内容的操作需要用户审查后再授权 */}
                        {act.privacyAuditRequired && act.status === 'pending' && (
                          <div className="flex items-start gap-1.5 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-600" />
                            <span>
                              {tr(
                                '此操作会生成修改后的新文件，请确认参数无误后再授权执行。',
                                'This creates a modified copy of your document. Review the parameters before approving.'
                              )}
                            </span>
                          </div>
                        )}

                        {act.result && (
                          <div className="text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                            {act.result}
                          </div>
                        )}

                        {act.error && (
                          <div className="text-[11px] text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200">
                            {act.error}
                          </div>
                        )}

                        {act.status === 'pending' && (
                          <div className="flex items-center space-x-2 pt-1">
                            <button
                              onClick={() => approveAction(act.id)}
                              className="flex-1 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center justify-center space-x-1 transition-colors shadow-xs"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>{t('copilot.approveAction')}</span>
                            </button>
                            <button
                              onClick={() => rejectAction(act.id)}
                              className="px-2 py-1 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
                            >
                              {t('copilot.rejectAction')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 智能长文档语义检索出处 (Local RAG Citations) */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-blue-700">
                      <span className="flex items-center gap-1">
                        <FileSearch className="w-3.5 h-3.5 text-blue-600" />
                        {tr(`出处定位 (${msg.citations.length})`, `Sources (${msg.citations.length})`)}
                      </span>
                      <span className="text-[10px] text-slate-400">{tr('点击跳转到对应页', 'Click to jump to page')}</span>
                    </div>

                    <div className="space-y-1.5">
                      {msg.citations.map((cite, idx) => (
                        <div
                          key={idx}
                          onClick={() => setCurrentPage(cite.page)}
                          className="group p-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer transition-all shadow-2xs"
                          title={tr(`点击跳转至第 ${cite.page} 页`, `Go to page ${cite.page}`)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">
                              {tr(`第 ${cite.page} 页`, `Page ${cite.page}`)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {tr('相关度排名', 'Relevance rank')} #{idx + 1}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 line-clamp-3 leading-relaxed font-sans select-text">
                            {cite.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {isGenerating && (
          <div className="flex items-center space-x-2 text-slate-500 italic">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            <span>{tr('智能体思考中...', 'Thinking...')}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 快捷推荐指令（生成中禁用，避免并发发送） */}
      <fieldset
        disabled={isGenerating}
        className="px-3 py-2 border-t border-slate-200 bg-white flex flex-wrap gap-1.5 disabled:opacity-50"
      >
        <button
          onClick={() => sendMessage(tr('为当前文档添加水印“内部绝密”', 'Add watermark CONFIDENTIAL'))}
          className="text-[10px] px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors border border-slate-200 shadow-2xs"
        >
          💧 {tr('添加“内部绝密”水印', 'Add CONFIDENTIAL watermark')}
        </button>
        <button
          onClick={() => sendMessage(tr('顺时针旋转90度', 'Rotate 90 degrees clockwise'))}
          className="text-[10px] px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors border border-slate-200 shadow-2xs"
        >
          🔄 {tr('旋转页面 90°', 'Rotate page 90°')}
        </button>
        <button
          onClick={() => sendMessage(tr('脱敏文档中的手机号', 'Redact phone numbers'))}
          className="text-[10px] px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors border border-slate-200 shadow-2xs"
        >
          🛡️ {tr('手机号脱敏', 'Redact phone numbers')}
        </button>
        <button
          onClick={() => sendMessage(tr('提取文档表格导出为Excel', 'Extract tables to Excel'))}
          className="text-[10px] px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors border border-slate-200 shadow-2xs"
        >
          📊 {tr('提取表格为 Excel', 'Tables to Excel')}
        </button>
        <button
          onClick={() => sendMessage(tr('使用Poppler提取版面文字', 'Extract text with Poppler'))}
          className="text-[10px] px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors border border-slate-200 shadow-2xs"
        >
          ⚡ {tr('Poppler 提取文本', 'Poppler text extraction')}
        </button>
        <button
          onClick={() => sendMessage(tr('锁定表单并扁平化', 'Flatten form fields'))}
          className="text-[10px] px-2 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors border border-slate-200 shadow-2xs"
        >
          🔒 {tr('扁平化表单', 'Flatten form')}
        </button>
      </fieldset>

      {/* 底部输入框 */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/90">
        <div className="flex items-center space-x-2 bg-white border border-slate-300 rounded-lg px-3 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors shadow-xs">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('copilot.inputPlaceholder')}
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!inputVal.trim() || isGenerating}
            title={t('copilot.send')}
            aria-label={t('copilot.send')}
            className="p-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white transition-colors shadow-2xs"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
