import { create } from 'zustand'
import type { AIConfig, ChatMessage, AgentAction } from '../../../shared/types'
import { useDocumentStore } from './useDocumentStore'
import { tr } from '../i18n'

interface AIState {
  isOpen: boolean
  isCheckingStatus: boolean
  isOllamaOnline: boolean
  availableModels: string[]
  config: AIConfig
  messages: ChatMessage[]
  isGenerating: boolean

  // Actions
  toggleOpen: () => void
  setOpen: (open: boolean) => void
  checkOllama: () => Promise<void>
  sendMessage: (text: string) => Promise<void>
  approveAction: (actionId: string) => Promise<void>
  rejectAction: (actionId: string) => void
  clearMessages: () => void
  setModel: (model: string) => void
  setBaseUrl: (baseUrl: string) => void
}

const AI_CONFIG_KEY = 'pdfopen.ai.config'

/** 欢迎语按当前语言生成（抽屉中渲染 id === 'welcome' 的消息时也会调用，保证切换语言后同步） */
export const getWelcomeMessage = () =>
  tr(
    '你好！我是 PDFOpen 智能体助手，可以通过自然语言帮你调用各项 PDF 功能。所有数据都在本机离线处理，不会上传。请直接告诉我你想做什么。',
    "Hi, I'm the PDFOpen assistant. I can run PDF tools for you from plain-language requests. Everything is processed offline on this machine and nothing is uploaded. Tell me what you'd like to do."
  )

/** 读取用户上次选择的模型与服务地址 */
const loadSavedConfig = (): Partial<AIConfig> => {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const persistConfig = (config: AIConfig) => {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify({ model: config.model, baseUrl: config.baseUrl }))
  } catch {
    // ignore
  }
}

export const useAIStore = create<AIState>((set, get) => ({
  isOpen: false,
  isCheckingStatus: false,
  isOllamaOnline: false,
  availableModels: [],
  config: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3:latest',
    temperature: 0.3,
    ...loadSavedConfig()
  },
  messages: [
    {
      id: 'welcome',
      role: 'assistant',
      content: getWelcomeMessage(),
      timestamp: Date.now()
    }
  ],
  isGenerating: false,

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),

  checkOllama: async () => {
    set({ isCheckingStatus: true })
    try {
      const res = await window.electronAPI.checkOllamaStatus(get().config.baseUrl)
      const current = get().config.model
      set({
        isOllamaOnline: res.running,
        availableModels: res.models,
        config: {
          ...get().config,
          // 仅当当前模型未安装时才回退到第一个可用模型，避免覆盖用户的选择
          model: res.models.length > 0 && !res.models.includes(current) ? res.models[0] : current
        }
      })
    } catch {
      set({ isOllamaOnline: false })
    } finally {
      set({ isCheckingStatus: false })
    }
  },

  sendMessage: async (text: string) => {
    // 正在生成时忽略新的发送（快捷指令按钮此前可并发触发，导致消息交错）
    if (get().isGenerating || !text.trim()) return
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    set((s) => ({
      messages: [...s.messages, userMsg],
      isGenerating: true
    }))

    const docState = useDocumentStore.getState()
    const activeTab = docState.tabs.find((t) => t.id === docState.activeTabId)

    // 本地快速语义规则 + 智能体意图识别
    const lower = text.toLowerCase()
    const has = (...keywords: string[]) => keywords.some((k) => lower.includes(k))
    const detectedActions: AgentAction[] = []

    if (activeTab) {
      if (has('水印', 'watermark')) {
        // 排除中英文引号/书名号，避免 为文档添加水印“内部绝密” 解析成 内部绝密”
        const watermarkText =
          text.match(/(?:水印|watermark)[：:“”‘’"'「」『』\s]*([^"'“”‘’「」『』\s，,。]+)/i)?.[1] || tr('机密文档', 'CONFIDENTIAL')
        detectedActions.push({
          id: `act_${Date.now()}_wm`,
          toolName: 'pdf_watermark',
          title: tr(`为文档添加水印: "${watermarkText}"`, `Add watermark: "${watermarkText}"`),
          parameters: {
            filePath: activeTab.filePath,
            text: watermarkText,
            position: 'tiled',
            opacity: 0.2
          },
          privacyAuditRequired: true,
          sanitizedSummary: tr(
            `将在当前文档全部 ${activeTab.pageCount} 页平铺嵌入水印 "${watermarkText}"，输出到同目录副本。`,
            `Tiles the watermark "${watermarkText}" across all ${activeTab.pageCount} pages and saves a copy in the same folder.`
          ),
          status: 'pending'
        })
      }

      if (has('旋转', 'rotate')) {
        const angle = lower.includes('180') ? 180 : lower.includes('270') ? 270 : 90
        detectedActions.push({
          id: `act_${Date.now()}_rot`,
          toolName: 'pdf_rotate',
          title: tr(`顺时针旋转页面 ${angle}°`, `Rotate page ${angle}° clockwise`),
          parameters: {
            filePath: activeTab.filePath,
            pages: [activeTab.currentPage],
            angle
          },
          privacyAuditRequired: true,
          sanitizedSummary: tr(
            `将第 ${activeTab.currentPage} 页顺时针旋转 ${angle} 度。`,
            `Rotates page ${activeTab.currentPage} by ${angle} degrees clockwise.`
          ),
          status: 'pending'
        })
      }

      const wantsExtract = has('提取', 'extract', 'export')
      if ((wantsExtract && has('文本', '文字', 'text')) || has('extract text')) {
        detectedActions.push({
          id: `act_${Date.now()}_pop_txt`,
          toolName: 'poppler_extract_text',
          title: tr('使用 Poppler 提取版面文字', 'Extract text with layout (Poppler)'),
          parameters: {
            filePath: activeTab.filePath,
            layout: true
          },
          privacyAuditRequired: false,
          sanitizedSummary: tr(
            '保留原始多栏排版与表格结构，从 PDF 中抽取纯文本。',
            'Extracts plain text from the PDF while keeping multi-column layout and table structure.'
          ),
          status: 'pending'
        })
      }

      if (wantsExtract && has('图片', '原图', 'image', 'picture', 'photo')) {
        detectedActions.push({
          id: `act_${Date.now()}_pop_img`,
          toolName: 'poppler_extract_images',
          title: tr('使用 Poppler 无损导出文档内嵌图片', 'Extract embedded images losslessly (Poppler)'),
          parameters: {
            filePath: activeTab.filePath
          },
          privacyAuditRequired: false,
          sanitizedSummary: tr(
            '不经二次压缩，直接从对象流中导出原始图片。',
            'Exports the original images straight from the object streams without recompression.'
          ),
          status: 'pending'
        })
      }

      if (has('贝茨', 'bates')) {
        detectedActions.push({
          id: `act_${Date.now()}_bates`,
          toolName: 'pdf_bates',
          title: tr('添加贝茨编号', 'Apply Bates numbering'),
          parameters: {
            filePath: activeTab.filePath,
            prefix: 'CONF-',
            startNumber: 1,
            digits: 6
          },
          privacyAuditRequired: true,
          sanitizedSummary: tr(
            '在页脚右下角添加从 CONF-000001 开始的连续编号。',
            'Adds sequential numbers starting at CONF-000001 to the bottom-right footer.'
          ),
          status: 'pending'
        })
      }

      if (has('ocr', '双层', '文字识别', 'searchable', 'text recognition')) {
        detectedActions.push({
          id: `act_${Date.now()}_ocr`,
          toolName: 'python_ocr_sandwich',
          title: tr('使用 RapidOCR 生成可搜索的双层 PDF', 'Create a searchable PDF with RapidOCR'),
          parameters: {
            filePath: activeTab.filePath,
            dpi: 200
          },
          privacyAuditRequired: false,
          sanitizedSummary: tr(
            '基于 ONNX Runtime 离线运行，逐页叠加对齐的隐藏文字层，保留原始外观。',
            'Runs offline on ONNX Runtime and adds an aligned invisible text layer to each page, keeping the original look.'
          ),
          status: 'pending'
        })
      }

      if (has('表格', 'excel', 'xlsx', 'table', 'spreadsheet')) {
        detectedActions.push({
          id: `act_${Date.now()}_table`,
          toolName: 'python_extract_tables',
          title: tr('识别表格并导出为 Excel 工作簿', 'Detect tables and export to an Excel workbook'),
          parameters: {
            filePath: activeTab.filePath,
            scope: 'all'
          },
          privacyAuditRequired: false,
          sanitizedSummary: tr(
            '识别无边框及跨行跨列表格，导出为带表头样式与斑马条纹的 .xlsx 文件。',
            'Detects borderless and merged-cell tables and exports them to a styled .xlsx file with headers and banded rows.'
          ),
          status: 'pending'
        })
      }

      if (
        has('脱敏', '抹除', 'redact', '隐藏手机', '隐藏电话', '隐藏身份证') ||
        (has('hide', 'remove', 'mask') && has('phone', 'email', 'id card', 'id number'))
      ) {
        let pattern = '@phone'
        let title = tr('全文档手机号脱敏', 'Redact phone numbers in the whole document')
        if (has('身份证', 'id card', 'id number')) {
          pattern = '@idcard'
          title = tr('全文档身份证号脱敏', 'Redact ID card numbers in the whole document')
        } else if (has('邮箱', 'email')) {
          pattern = '@email'
          title = tr('全文档邮箱地址脱敏', 'Redact email addresses in the whole document')
        }
        detectedActions.push({
          id: `act_${Date.now()}_redact`,
          toolName: 'python_redact',
          title,
          parameters: {
            filePath: activeTab.filePath,
            pattern
          },
          privacyAuditRequired: true,
          sanitizedSummary: tr(
            `不可逆地抹除并覆盖匹配内容，匹配规则: ${pattern}。`,
            `Permanently removes and covers matching content. Pattern: ${pattern}.`
          ),
          status: 'pending'
        })
      }

      if (has('表单锁定', '扁平化', 'flatten')) {
        detectedActions.push({
          id: `act_${Date.now()}_flatten`,
          toolName: 'pdf_flatten_form',
          title: tr('表单扁平化锁定 (Flatten)', 'Flatten form fields'),
          parameters: {
            filePath: activeTab.filePath
          },
          privacyAuditRequired: true,
          sanitizedSummary: tr(
            '将所有交互式表单控件转换为不可编辑的静态内容，防止篡改。',
            'Converts all interactive form fields into static, non-editable content to prevent tampering.'
          ),
          status: 'pending'
        })
      }
    }

    let citations: { page: number; text: string; score: number }[] | undefined
    let replyContent = ''
    let modelError = ''

    // 智能长文档 Local RAG 检索：当用户提问或未命中工具指令时尝试检索原文出处
    if (activeTab && detectedActions.length === 0) {
      try {
        const ragRes = await window.electronAPI.pythonQueryRAG(activeTab.filePath, text)
        if (ragRes.success && ragRes.citations && ragRes.citations.length > 0) {
          citations = ragRes.citations
        }
      } catch (e) {
        console.error('RAG query failed', e)
      }
    }

    // 如果 Ollama 在线，通过模型进行语义推理
    if (get().isOllamaOnline) {
      try {
        let sysPrompt = `你是一个专业的离线本地 PDF 处理与研读智能体。当前打开文档: ${activeTab ? activeTab.fileName : '无'}，共 ${activeTab ? activeTab.pageCount : 0} 页。`
        if (citations && citations.length > 0) {
          const ragContext = citations
            .map((c, i) => `[出处${i + 1} - 第 ${c.page} 页 (相关度 ${(c.score * 100).toFixed(0)}%)]: ${c.text}`)
            .join('\n\n')
          sysPrompt += `\n\n【文档检索到的参考片段】:\n${ragContext}\n\n请结合以上检索到的出处回答用户，并在回答中标注涉及的具体页码出处。`
        } else {
          sysPrompt += `\n请简明扼要回复用户。`
        }
        sysPrompt += `\n请使用用户提问所用的语言作答。Always answer in the same language the user writes in.`

        const res = await window.electronAPI.callAIModel(get().config, [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: text }
        ])
        if (res.error) {
          modelError = res.error
        } else {
          replyContent = res.text
        }
      } catch (err: any) {
        modelError = err?.message || String(err)
      }
    }

    if (!replyContent) {
      if (detectedActions.length > 0) {
        replyContent = tr(
          `我已为你规划了 ${detectedActions.length} 项操作。请在下方卡片中查看操作细节与隐私提示，点击“授权执行”后开始处理。`,
          `I've planned ${detectedActions.length} operation(s). Review the details and privacy notes in the cards below, then click "Approve & Execute" to start.`
        )
      } else if (citations && citations.length > 0) {
        replyContent = tr(
          `已在文档《${activeTab?.fileName}》中检索到 ${citations.length} 处相关内容：`,
          `Found ${citations.length} relevant passage(s) in "${activeTab?.fileName}":`
        )
      } else {
        replyContent = activeTab
          ? tr(
              `收到指令：“${text}”。你可以让我为当前文档《${activeTab.fileName}》添加水印、旋转页面、OCR 识别、导出表格、脱敏，或直接提问文档内容。`,
              `Got it: "${text}". For "${activeTab.fileName}" I can add a watermark, rotate pages, run OCR, export tables, redact sensitive data, or answer questions about its content.`
            )
          : tr(
              '当前还没有打开 PDF 文件。请先在主界面打开一个 PDF 文档，然后再向我下达指令。',
              "No PDF is open yet. Open a PDF in the main window first, then tell me what you'd like to do."
            )
      }
      if (modelError) {
        replyContent += tr(
          `\n\n（本地模型调用失败，已改用离线规则引擎：${modelError}）`,
          `\n\n(Local model call failed, fell back to the offline rule engine: ${modelError})`
        )
      }
    }

    const assistantMsg: ChatMessage = {
      id: `msg_${Date.now()}_reply`,
      role: 'assistant',
      content: replyContent,
      timestamp: Date.now(),
      actions: detectedActions,
      citations
    }

    set((s) => ({
      messages: [...s.messages, assistantMsg],
      isGenerating: false
    }))
  },

  approveAction: async (actionId: string) => {
    // 幂等守卫：已在执行中或已完成的操作直接返回，防止快速双击并发执行同一操作两次
    for (const m of get().messages) {
      const existing = m.actions?.find((a) => a.id === actionId)
      if (existing) {
        if (existing.status === 'executing' || existing.status === 'completed') return
        break
      }
    }

    const docStore = useDocumentStore.getState()
    const activeTab = docStore.tabs.find((t) => t.id === docStore.activeTabId)
    if (!activeTab) return

    // 同步占位：进入任何 await 之前先把该 action 标记为 executing，后续重复调用会被上面的守卫拦截
    set((s) => ({
      messages: s.messages.map((m) => ({
        ...m,
        actions: m.actions?.map((a) => (a.id === actionId ? { ...a, status: 'executing' } : a))
      }))
    }))

    // 寻找对应 action
    let targetAction: AgentAction | undefined
    for (const m of get().messages) {
      const found = m.actions?.find((a) => a.id === actionId)
      if (found) {
        targetAction = found
        break
      }
    }

    if (!targetAction) return
    // 复制一份，避免直接修改 store 中的状态对象
    targetAction = { ...targetAction }

    try {
      // 输出到原文件旁（工作副本在临时目录，不适合作为输出位置）
      const baseOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '')

      // 统一校验操作结果：失败时抛错，让卡片显示“失败”而不是误报“已完成”
      const ensureOk = <T extends { success: boolean; error?: string; message?: string }>(res: T, fallback: string): T => {
        if (!res?.success) throw new Error(res?.error || res?.message || fallback)
        return res
      }

      if (targetAction.toolName === 'pdf_watermark') {
        const out = `${baseOut}_watermarked.pdf`
        ensureOk(
          await window.electronAPI.addWatermark(
            activeTab.filePath,
            {
              text: targetAction.parameters.text,
              position: targetAction.parameters.position,
              opacity: targetAction.parameters.opacity
            },
            out
          ),
          tr('添加水印失败', 'Failed to add watermark')
        )
        targetAction.result = tr(`已生成带水印副本: ${out}`, `Watermarked copy saved: ${out}`)
        await docStore.openDocument(out)
      } else if (targetAction.toolName === 'pdf_rotate') {
        const out = `${baseOut}_rotated.pdf`
        ensureOk(
          await window.electronAPI.rotatePages(
            activeTab.filePath,
            targetAction.parameters.pages,
            targetAction.parameters.angle,
            out
          ),
          tr('旋转页面失败', 'Failed to rotate pages')
        )
        targetAction.result = tr(`已生成旋转后的副本: ${out}`, `Rotated copy saved: ${out}`)
        await docStore.openDocument(out)
      } else if (targetAction.toolName === 'poppler_extract_text') {
        const res = ensureOk(
          await window.electronAPI.popplerExtractText(activeTab.filePath, { layout: true }),
          tr('文本提取失败', 'Text extraction failed')
        )
        const text = res.text || ''
        targetAction.result =
          text.length > 1000
            ? `${text.slice(0, 1000)}${tr('...(已截取前 1000 字)', '... (first 1000 characters shown)')}`
            : text || tr('（文档中没有可提取的文字）', '(No extractable text in this document)')
      } else if (targetAction.toolName === 'poppler_extract_images') {
        const outDir = `${baseOut}_images`
        const res = ensureOk(
          await window.electronAPI.popplerExtractImages(activeTab.filePath, outDir),
          tr('图片提取失败', 'Image extraction failed')
        )
        targetAction.result = tr(
          `已导出 ${res.count || 0} 张原始图片到文件夹: ${outDir}`,
          `Exported ${res.count || 0} original image(s) to: ${outDir}`
        )
      } else if (targetAction.toolName === 'pdf_bates') {
        const out = `${baseOut}_bates.pdf`
        const { filePath: _ignored, ...batesOptions } = targetAction.parameters
        ensureOk(
          await window.electronAPI.applyBatesNumbering(activeTab.filePath, batesOptions as any, out),
          tr('贝茨编号失败', 'Bates numbering failed')
        )
        targetAction.result = tr(`已生成带贝茨编号的副本: ${out}`, `Bates-numbered copy saved: ${out}`)
        await docStore.openDocument(out)
      } else if (targetAction.toolName === 'python_ocr_sandwich') {
        const out = `${baseOut}_searchable_ocr.pdf`
        const res = await window.electronAPI.pythonOcrSandwich(activeTab.filePath, out, 200)
        if (res.success && res.outputPath) {
          targetAction.result = tr(
            `已生成双层可搜索 PDF（共识别 ${res.totalWords || 0} 字），正在载入...`,
            `Searchable PDF created (${res.totalWords || 0} words recognized), opening...`
          )
          await docStore.openDocument(out)
        } else {
          throw new Error(res.error || tr('OCR 制作失败', 'OCR failed'))
        }
      } else if (targetAction.toolName === 'python_extract_tables') {
        const out = `${baseOut}_extracted_tables.xlsx`
        const res = await window.electronAPI.pythonExtractTables(activeTab.filePath, out)
        if (res.success && res.outputPath) {
          targetAction.result = tr(
            `已识别 ${res.tableCount || 0} 个表格并导出至: ${out}`,
            `Detected ${res.tableCount || 0} table(s), exported to: ${out}`
          )
        } else {
          throw new Error(res.error || tr('表格提取失败', 'Table extraction failed'))
        }
      } else if (targetAction.toolName === 'python_redact') {
        const out = `${baseOut}_redacted.pdf`
        const res = await window.electronAPI.pythonRedact(
          activeTab.filePath,
          out,
          undefined,
          undefined,
          targetAction.parameters.pattern,
          [0, 0, 0]
        )
        if (res.success && res.outputPath) {
          targetAction.result = tr(
            `已脱敏 ${res.redactedCount ?? 0} 处敏感数据并保存。`,
            `Redacted ${res.redactedCount ?? 0} sensitive item(s) and saved.`
          )
          await docStore.openDocument(out)
        } else {
          throw new Error(res.error || tr('脱敏失败', 'Redaction failed'))
        }
      } else if (targetAction.toolName === 'pdf_flatten_form') {
        const out = `${baseOut}_flattened.pdf`
        const res = await window.electronAPI.pdfFlattenForm(activeTab.filePath, out)
        if (res.success && res.outputPath) {
          targetAction.result = tr('表单已扁平化，无法再被编辑。', 'Form flattened; fields can no longer be edited.')
          await docStore.openDocument(out)
        } else {
          throw new Error(res.message || tr('表单扁平化失败', 'Failed to flatten form'))
        }
      }

      set((s) => ({
        messages: s.messages.map((m) => ({
          ...m,
          actions: m.actions?.map((a) =>
            a.id === actionId
              ? { ...a, status: 'completed', result: targetAction?.result || tr('执行成功', 'Completed') }
              : a
          )
        }))
      }))
    } catch (err: any) {
      set((s) => ({
        messages: s.messages.map((m) => ({
          ...m,
          actions: m.actions?.map((a) =>
            a.id === actionId
              ? { ...a, status: 'failed', error: err.message || tr('执行遇到错误', 'An error occurred') }
              : a
          )
        }))
      }))
    }
  },

  rejectAction: (actionId: string) => {
    set((s) => ({
      messages: s.messages.map((m) => ({
        ...m,
        actions: m.actions?.map((a) =>
          a.id === actionId ? { ...a, status: 'failed', error: tr('用户已取消', 'Cancelled by user') } : a
        )
      }))
    }))
  },

  clearMessages: () => set({ messages: [] }),

  setModel: (model) => {
    const config = { ...get().config, model }
    set({ config })
    persistConfig(config)
  },

  setBaseUrl: (baseUrl) => {
    const config = { ...get().config, baseUrl }
    set({ config })
    persistConfig(config)
    void get().checkOllama()
  }
}))
