import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'

const resources = {
  zh: {
    translation: {
      app: {
        name: 'PDFOpen Studio',
        tagline: '本地优先 · AI 智能驱动 · 全能 PDF 工作台',
        noFileOpen: '暂无打开的 PDF 文档',
        openFilePrompt: '拖拽 PDF 到此处，或点击按钮选择文件',
        openFileBtn: '打开 PDF 文件',
        welcomeHint: '支持所有主流 PDF 功能、本地离线大模型驱动与拖拽工作流'
      },
      nav: {
        file: '文件',
        edit: '编辑',
        pages: '页面管理',
        tools: '工具箱',
        aiCopilot: 'AI 智能体',
        workflow: '工作流画布',
        settings: '设置'
      },
      toolbar: {
        open: '打开',
        save: '保存',
        saveAs: '另存为',
        merge: '多文件合并',
        split: '拆分文档',
        rotate: '旋转页面',
        watermark: '添加水印',
        bates: '贝茨编号',
        popplerText: 'Poppler版面文字提取',
        popplerImages: 'Poppler无损原图导出',
        docInfo: '文档属性',
        zoomIn: '放大',
        zoomOut: '缩小',
        fitWidth: '适合宽度',
        fitPage: '整页自适应',
        page: '页码',
        of: '共'
      },
      sidebar: {
        thumbnails: '页面缩略图',
        outline: '书签大纲',
        annotations: '批注列表',
        metadata: '文档信息'
      },
      copilot: {
        title: 'AI Agent Copilot',
        statusOnline: '本地模型在线',
        statusOffline: '未检测到本地模型',
        checkOllama: '刷新 Ollama 状态',
        inputPlaceholder: '向 AI 发送指令（如：“将前3页提取出来，加上绝密水印并导出”)...',
        send: '发送',
        suggestedTitle: '智能体快捷指令：',
        suggested1: '总结此文档的核心主旨与关键数据',
        suggested2: '提取所有表格并导出为结构化数据',
        suggested3: '为当前文档所有页面平铺“内部资料”防泄密水印',
        privacyWarning: '隐私安全审查提示',
        privacyDetail: '该操作涉及调用模型解析文本。当前处于本地离线模式，所有数据仅在您本机的 Ollama / LM Studio 内部流转，绝不上传云端。',
        approveAction: '授权执行',
        rejectAction: '取消'
      },
      workflow: {
        title: '可视化 PDF 工作流画布',
        description: '基于节点连线编排复杂的批处理流水线，支持一键自动化执行',
        run: '运行工作流',
        stop: '停止',
        addNode: '添加节点',
        loadTemplate: '载入模板',
        template1: '发票自动版面提取与分类',
        template2: '批量合同加盖水印并加密',
        template3: '扫描件 OCR 识别并导出纯文本'
      },
      operations: {
        mergeSuccess: 'PDF 合并完成',
        splitSuccess: 'PDF 拆分完成',
        rotateSuccess: '页面旋转已应用',
        watermarkSuccess: '水印已成功嵌入',
        batesSuccess: '贝茨编号已应用',
        extractSuccess: '页面提取完成'
      }
    }
  },
  en: {
    translation: {
      app: {
        name: 'PDFOpen Studio',
        tagline: 'Local-First, AI-Native, All-in-One PDF Powerhouse',
        noFileOpen: 'No PDF Document Opened',
        openFilePrompt: 'Drag and drop a PDF file here, or click to browse',
        openFileBtn: 'Open PDF File',
        welcomeHint: 'Complete PDF suite with local LLM integration and visual workflow editor'
      },
      nav: {
        file: 'File',
        edit: 'Edit',
        pages: 'Pages',
        tools: 'Tools',
        aiCopilot: 'AI Copilot',
        workflow: 'Workflow Canvas',
        settings: 'Settings'
      },
      toolbar: {
        open: 'Open',
        save: 'Save',
        saveAs: 'Save As',
        merge: 'Merge',
        split: 'Split',
        rotate: 'Rotate',
        watermark: 'Watermark',
        bates: 'Bates Number',
        popplerText: 'Poppler Text Layout',
        popplerImages: 'Poppler Extract Images',
        docInfo: 'Properties',
        zoomIn: 'Zoom In',
        zoomOut: 'Zoom Out',
        fitWidth: 'Fit Width',
        fitPage: 'Fit Page',
        page: 'Page',
        of: 'of'
      },
      sidebar: {
        thumbnails: 'Thumbnails',
        outline: 'Bookmarks',
        annotations: 'Annotations',
        metadata: 'Document Info'
      },
      copilot: {
        title: 'AI Agent Copilot',
        statusOnline: 'Local Model Online',
        statusOffline: 'Local Model Offline',
        checkOllama: 'Refresh Ollama',
        inputPlaceholder: 'Ask AI Agent (e.g. "Extract first 3 pages and add confidential watermark")...',
        send: 'Send',
        suggestedTitle: 'Prompt Shortcuts:',
        suggested1: 'Summarize main points & key figures',
        suggested2: 'Extract tables into structured format',
        suggested3: 'Add tiled "CONFIDENTIAL" watermark across all pages',
        privacyWarning: 'Privacy Security Notice',
        privacyDetail: 'This operation uses local Ollama/LM Studio. Zero telemetry or network transmission.',
        approveAction: 'Approve & Execute',
        rejectAction: 'Cancel'
      },
      workflow: {
        title: 'Visual Workflow Studio',
        description: 'Drag, connect, and chain PDF processing blocks into automated pipelines',
        run: 'Run Workflow',
        stop: 'Stop',
        addNode: 'Add Node',
        loadTemplate: 'Templates',
        template1: 'Invoice extraction & sort',
        template2: 'Batch contract watermark & encrypt',
        template3: 'Scan OCR to text pipeline'
      },
      operations: {
        mergeSuccess: 'PDFs merged successfully',
        splitSuccess: 'PDF split successfully',
        rotateSuccess: 'Pages rotated successfully',
        watermarkSuccess: 'Watermark applied successfully',
        batesSuccess: 'Bates numbers applied successfully',
        extractSuccess: 'Pages extracted successfully'
      }
    }
  }
}

const LANG_STORAGE_KEY = 'pdfopen.language'

/** 首次启动按系统语言选择，之后记住用户的选择 */
const detectInitialLanguage = (): 'zh' | 'en' => {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    // localStorage 不可用时忽略
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lng)
  } catch {
    // ignore
  }
  document.documentElement.lang = lng === 'zh' ? 'zh-CN' : 'en'
})
document.documentElement.lang = i18n.language === 'zh' ? 'zh-CN' : 'en'

/**
 * 轻量双语助手：文案就地书写中英两种版本，避免维护庞大的 key 表。
 *   组件内：const tr = useTr();  tr('打开', 'Open')
 *   组件外（store、工具函数）：tr('打开', 'Open')
 */
export const tr = (zh: string, en: string): string => (i18n.language === 'zh' ? zh : en)

export const useTr = () => {
  // 订阅语言变化，确保切换语言后组件重新渲染
  const { i18n: instance } = useTranslation()
  return (zh: string, en: string): string => (instance.language === 'zh' ? zh : en)
}

export const isZh = () => i18n.language === 'zh'

export default i18n
