import { create } from 'zustand'
import { Position, type Node, type Edge } from '@xyflow/react'
import { useDocumentStore } from './useDocumentStore'
import { toast } from './useToastStore'
import { tr } from '../i18n'
import type { CompressLevel } from '../../../shared/types'

// ───────────────────────── 节点类型注册表 ─────────────────────────

export type WorkflowOperation =
  | 'input'
  | 'watermark'
  | 'bates'
  | 'rotate'
  | 'reorder'
  | 'pageNumbers'
  | 'compress'
  | 'grayscale'
  | 'encrypt'
  | 'ocr'
  | 'popplerText'
  | 'popplerImages'
  | 'tables'
  | 'output'

export type ParamValue = string | number | boolean

/** 双语文案对：[中文, English] */
export type Bilingual = [string, string]

export interface ParamDefinition {
  key: string
  label: Bilingual
  type: 'text' | 'number' | 'select' | 'checkbox' | 'password'
  default: ParamValue
  options?: { value: string; label: Bilingual }[]
  min?: number
  max?: number
  step?: number
  placeholder?: Bilingual
  hint?: Bilingual
}

export interface NodeDefinition {
  operation: WorkflowOperation
  icon: string
  color: string
  title: Bilingual
  description: Bilingual
  params: ParamDefinition[]
  /** 节点卡片上显示的参数摘要 */
  summary?: (params: Record<string, ParamValue>) => string
}

export type NodeStatus = 'running' | 'success' | 'error'

export type WorkflowTemplateKey = 'watermark' | 'poppler' | 'reorder' | 'rapidocr'

const t2 = (pair: Bilingual) => tr(pair[0], pair[1])

const POSITION_OPTIONS_6: ParamDefinition['options'] = [
  { value: 'bottom-center', label: ['底部居中', 'Bottom center'] },
  { value: 'bottom-right', label: ['右下角', 'Bottom right'] },
  { value: 'bottom-left', label: ['左下角', 'Bottom left'] },
  { value: 'top-center', label: ['顶部居中', 'Top center'] },
  { value: 'top-right', label: ['右上角', 'Top right'] },
  { value: 'top-left', label: ['左上角', 'Top left'] }
]

export const NODE_DEFINITIONS: Record<WorkflowOperation, NodeDefinition> = {
  input: {
    operation: 'input',
    icon: '📄',
    color: '#3b82f6',
    title: ['输入 PDF', 'Input PDF'],
    description: ['工作流的起点：当前活动文档或手动选择的 PDF', 'Starting point: the active document or a PDF you pick'],
    params: [
      {
        key: 'source',
        label: ['输入来源', 'Source'],
        type: 'select',
        default: 'active',
        options: [
          { value: 'active', label: ['当前活动标签页', 'Active tab'] },
          { value: 'pick', label: ['运行时选择文件', 'Pick a file at run time'] }
        ],
        hint: ['若没有打开的文档，将自动弹出文件选择框。', 'If no document is open, a file picker will be shown.']
      }
    ],
    summary: (p) => (p.source === 'pick' ? tr('运行时选择文件', 'Pick file at run time') : tr('当前活动文档', 'Active document'))
  },
  watermark: {
    operation: 'watermark',
    icon: '💧',
    color: '#06b6d4',
    title: ['文字水印', 'Text Watermark'],
    description: ['为所有页面嵌入文字水印', 'Stamp a text watermark on every page'],
    params: [
      { key: 'text', label: ['水印文字', 'Text'], type: 'text', default: tr('内部资料', 'CONFIDENTIAL') },
      {
        key: 'position',
        label: ['位置', 'Position'],
        type: 'select',
        default: 'tiled',
        options: [
          { value: 'tiled', label: ['平铺', 'Tiled'] },
          { value: 'center', label: ['居中', 'Center'] },
          { value: 'header', label: ['页眉', 'Header'] },
          { value: 'footer', label: ['页脚', 'Footer'] }
        ]
      },
      { key: 'opacity', label: ['不透明度 (0-1)', 'Opacity (0-1)'], type: 'number', default: 0.2, min: 0, max: 1, step: 0.05 },
      { key: 'fontSize', label: ['字号', 'Font size'], type: 'number', default: 48, min: 6, max: 200, step: 1 },
      { key: 'rotation', label: ['旋转角度', 'Rotation (°)'], type: 'number', default: 45, min: -180, max: 180, step: 5 },
      { key: 'color', label: ['颜色 (HEX)', 'Color (hex)'], type: 'text', default: '#808080', placeholder: ['#808080', '#808080'] }
    ],
    summary: (p) => `"${String(p.text ?? '')}"`
  },
  bates: {
    operation: 'bates',
    icon: '🔢',
    color: '#8b5cf6',
    title: ['贝茨编号', 'Bates Numbering'],
    description: ['为每页注入法律贝茨编号', 'Add legal Bates numbers to every page'],
    params: [
      { key: 'prefix', label: ['前缀', 'Prefix'], type: 'text', default: 'CONF-' },
      { key: 'suffix', label: ['后缀', 'Suffix'], type: 'text', default: '' },
      { key: 'startNumber', label: ['起始编号', 'Start number'], type: 'number', default: 1, min: 0, step: 1 },
      { key: 'digits', label: ['位数', 'Digits'], type: 'number', default: 6, min: 1, max: 12, step: 1 },
      {
        key: 'position',
        label: ['位置', 'Position'],
        type: 'select',
        default: 'bottom-right',
        options: POSITION_OPTIONS_6!.filter((o) => o.value !== 'top-center')
      },
      { key: 'fontSize', label: ['字号', 'Font size'], type: 'number', default: 10, min: 4, max: 72, step: 1 }
    ],
    summary: (p) => {
      const digits = Math.max(1, Math.min(12, Number(p.digits) || 6))
      return `${String(p.prefix ?? '')}${String(Number(p.startNumber) || 0).padStart(digits, '0')}${String(p.suffix ?? '')}`
    }
  },
  rotate: {
    operation: 'rotate',
    icon: '🔄',
    color: '#f59e0b',
    title: ['旋转页面', 'Rotate Pages'],
    description: ['按指定角度旋转页面', 'Rotate pages by a fixed angle'],
    params: [
      {
        key: 'angle',
        label: ['角度', 'Angle'],
        type: 'select',
        default: '90',
        options: [
          { value: '90', label: ['顺时针 90°', '90° clockwise'] },
          { value: '180', label: ['180°', '180°'] },
          { value: '270', label: ['逆时针 90°', '90° counter-clockwise'] }
        ]
      },
      {
        key: 'pages',
        label: ['页码范围', 'Page range'],
        type: 'text',
        default: '',
        placeholder: ['留空 = 全部，如 1-3,5', 'Empty = all, e.g. 1-3,5']
      }
    ],
    summary: (p) => `${String(p.angle)}° · ${String(p.pages || '') || tr('全部页面', 'all pages')}`
  },
  reorder: {
    operation: 'reorder',
    icon: '🔀',
    color: '#ec4899',
    title: ['页面重排', 'Reorder Pages'],
    description: ['倒序排列页面或按自定义顺序重排', 'Reverse page order or apply a custom order'],
    params: [
      {
        key: 'mode',
        label: ['模式', 'Mode'],
        type: 'select',
        default: 'reverse',
        options: [
          { value: 'reverse', label: ['倒序', 'Reverse'] },
          { value: 'oddEven', label: ['先奇数页后偶数页', 'Odd pages, then even'] },
          { value: 'custom', label: ['自定义顺序', 'Custom order'] }
        ]
      },
      {
        key: 'customOrder',
        label: ['自定义顺序', 'Custom order'],
        type: 'text',
        default: '',
        placeholder: ['如 3,1,2 或 5-1', 'e.g. 3,1,2 or 5-1'],
        hint: ['仅在“自定义顺序”模式下生效，未列出的页面将被丢弃。', 'Used only in Custom mode; unlisted pages are dropped.']
      }
    ],
    summary: (p) =>
      p.mode === 'custom'
        ? `${tr('自定义', 'Custom')}: ${String(p.customOrder || '-')}`
        : p.mode === 'oddEven'
          ? tr('奇数页 → 偶数页', 'Odd → even')
          : tr('倒序', 'Reverse')
  },
  pageNumbers: {
    operation: 'pageNumbers',
    icon: '#️⃣',
    color: '#14b8a6',
    title: ['添加页码', 'Page Numbers'],
    description: ['在页眉或页脚添加页码', 'Add page numbers to header or footer'],
    params: [
      {
        key: 'format',
        label: ['格式', 'Format'],
        type: 'text',
        default: '{page} / {total}',
        hint: ['可用占位符 {page} 与 {total}，仅支持英文字符。', 'Placeholders: {page} and {total} (ASCII only).']
      },
      { key: 'position', label: ['位置', 'Position'], type: 'select', default: 'bottom-center', options: POSITION_OPTIONS_6 },
      { key: 'startPage', label: ['起始页码', 'Start number'], type: 'number', default: 1, min: 0, step: 1 },
      { key: 'fontSize', label: ['字号', 'Font size'], type: 'number', default: 10, min: 4, max: 72, step: 1 },
      { key: 'skipFirstPage', label: ['跳过首页', 'Skip first page'], type: 'checkbox', default: false }
    ],
    summary: (p) => String(p.format || '')
  },
  compress: {
    operation: 'compress',
    icon: '🗜️',
    color: '#84cc16',
    title: ['压缩 PDF', 'Compress PDF'],
    description: ['降低文件体积', 'Reduce file size'],
    params: [
      {
        key: 'level',
        label: ['压缩强度', 'Level'],
        type: 'select',
        default: 'medium',
        options: [
          { value: 'low', label: ['低（画质优先）', 'Low (best quality)'] },
          { value: 'medium', label: ['中', 'Medium'] },
          { value: 'high', label: ['高（体积优先）', 'High (smallest size)'] }
        ]
      }
    ],
    summary: (p) => String(p.level)
  },
  grayscale: {
    operation: 'grayscale',
    icon: '🌓',
    color: '#94a3b8',
    title: ['灰度 / 反色', 'Grayscale / Invert'],
    description: ['将页面转换为灰度或反色（会栅格化页面）', 'Convert pages to grayscale or invert colors (rasterizes pages)'],
    params: [
      {
        key: 'mode',
        label: ['模式', 'Mode'],
        type: 'select',
        default: 'grayscale',
        options: [
          { value: 'grayscale', label: ['灰度', 'Grayscale'] },
          { value: 'invert', label: ['反色', 'Invert'] }
        ]
      }
    ],
    summary: (p) => (p.mode === 'invert' ? tr('反色', 'Invert') : tr('灰度', 'Grayscale'))
  },
  encrypt: {
    operation: 'encrypt',
    icon: '🔒',
    color: '#ef4444',
    title: ['加密 PDF', 'Encrypt PDF'],
    description: ['设置打开密码与权限（建议放在流水线末尾）', 'Set passwords and permissions (best placed last)'],
    params: [
      { key: 'userPassword', label: ['打开密码', 'Open password'], type: 'password', default: '' },
      { key: 'ownerPassword', label: ['权限密码', 'Owner password'], type: 'password', default: '' },
      { key: 'allowPrinting', label: ['允许打印', 'Allow printing'], type: 'checkbox', default: true },
      { key: 'allowCopying', label: ['允许复制内容', 'Allow copying'], type: 'checkbox', default: false },
      { key: 'allowModifying', label: ['允许修改', 'Allow modifying'], type: 'checkbox', default: false }
    ],
    summary: (p) => (p.userPassword ? tr('已设置打开密码', 'Open password set') : tr('仅权限密码', 'Owner password only'))
  },
  ocr: {
    operation: 'ocr',
    icon: '🔍',
    color: '#f43f5e',
    title: ['OCR 双层 PDF', 'OCR Searchable PDF'],
    description: ['RapidOCR 识别并注入透明文字层', 'RapidOCR: add an invisible text layer'],
    params: [{ key: 'dpi', label: ['识别 DPI', 'DPI'], type: 'number', default: 200, min: 72, max: 600, step: 25 }],
    summary: (p) => `${Number(p.dpi) || 200} DPI`
  },
  popplerText: {
    operation: 'popplerText',
    icon: '⚡',
    color: '#10b981',
    title: ['提取文字 (Poppler)', 'Extract Text (Poppler)'],
    description: ['用 pdftotext 提取文字并保存为 .txt', 'Extract text with pdftotext and save as .txt'],
    params: [
      { key: 'layout', label: ['保留版面布局', 'Keep layout'], type: 'checkbox', default: true },
      { key: 'pageStart', label: ['起始页 (0 = 首页)', 'First page (0 = start)'], type: 'number', default: 0, min: 0, step: 1 },
      { key: 'pageEnd', label: ['结束页 (0 = 末页)', 'Last page (0 = end)'], type: 'number', default: 0, min: 0, step: 1 }
    ],
    summary: (p) => (p.layout ? '-layout' : tr('纯文本', 'plain text'))
  },
  popplerImages: {
    operation: 'popplerImages',
    icon: '🖼️',
    color: '#0ea5e9',
    title: ['导出原图 (Poppler)', 'Extract Images (Poppler)'],
    description: ['用 pdfimages 无损导出内嵌图片到文件夹', 'Export embedded images losslessly with pdfimages'],
    params: [],
    summary: () => 'pdfimages -png'
  },
  tables: {
    operation: 'tables',
    icon: '📊',
    color: '#22c55e',
    title: ['表格还原 (.xlsx)', 'Extract Tables (.xlsx)'],
    description: ['深度学习识别表格并导出 Excel', 'Detect tables and export to Excel'],
    params: [
      {
        key: 'pages',
        label: ['页码范围', 'Page range'],
        type: 'text',
        default: '',
        placeholder: ['留空 = 全部，如 1-3,5', 'Empty = all, e.g. 1-3,5']
      }
    ],
    summary: (p) => String(p.pages || '') || tr('全部页面', 'all pages')
  },
  output: {
    operation: 'output',
    icon: '💾',
    color: '#22c55e',
    title: ['导出结果', 'Export Result'],
    description: ['保存最终 PDF 并汇总全部产物', 'Save the final PDF and summarize all artifacts'],
    params: [
      { key: 'suffix', label: ['默认文件名后缀', 'Default file suffix'], type: 'text', default: '_workflow' },
      { key: 'openAfter', label: ['完成后在阅读器中打开', 'Open in viewer when done'], type: 'checkbox', default: true }
    ],
    summary: (p) => (p.openAfter ? tr('保存并打开', 'Save & open') : tr('仅保存', 'Save only'))
  }
}

/** 节点面板的展示顺序（仅包含执行器支持的类型） */
export const PALETTE_ORDER: WorkflowOperation[] = [
  'input',
  'watermark',
  'bates',
  'rotate',
  'reorder',
  'pageNumbers',
  'compress',
  'grayscale',
  'encrypt',
  'ocr',
  'popplerText',
  'popplerImages',
  'tables',
  'output'
]

export const getDefaultParams = (operation: WorkflowOperation): Record<string, ParamValue> =>
  Object.fromEntries(NODE_DEFINITIONS[operation].params.map((param) => [param.key, param.default]))

export const getNodeOperation = (node: Node): WorkflowOperation | null => {
  const op = node.data?.operation
  return typeof op === 'string' && op in NODE_DEFINITIONS ? (op as WorkflowOperation) : null
}

export const getNodeParams = (node: Node): Record<string, ParamValue> => {
  const op = getNodeOperation(node)
  const defaults = op ? getDefaultParams(op) : {}
  const params = (node.data?.params || {}) as Record<string, ParamValue>
  return { ...defaults, ...params }
}

let nodeSeq = 0
const newNodeId = (op: WorkflowOperation) => `${op}-${Date.now().toString(36)}-${(nodeSeq++).toString(36)}`

function createNode(
  operation: WorkflowOperation,
  position: { x: number; y: number },
  options: { id?: string; params?: Record<string, ParamValue> } = {}
): Node {
  return {
    id: options.id || newNodeId(operation),
    type: operation === 'input' ? 'input' : operation === 'output' ? 'output' : 'default',
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { operation, params: { ...getDefaultParams(operation), ...(options.params || {}) } }
  }
}

function createEdge(source: string, target: string, color = '#38bdf8'): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    animated: true,
    style: { stroke: color }
  }
}

// ───────────────────────── 预设模板 ─────────────────────────

function buildTemplate(key: WorkflowTemplateKey): { nodes: Node[]; edges: Edge[]; name: string } {
  if (key === 'poppler') {
    const nodes = [
      createNode('input', { x: 50, y: 150 }, { id: 'p-in' }),
      createNode('popplerText', { x: 320, y: 80 }, { id: 'p-text' }),
      createNode('popplerImages', { x: 320, y: 220 }, { id: 'p-images' }),
      createNode('output', { x: 600, y: 150 }, { id: 'p-out' })
    ]
    const edges = [
      createEdge('p-in', 'p-text', '#10b981'),
      createEdge('p-in', 'p-images', '#06b6d4'),
      createEdge('p-text', 'p-out', '#10b981'),
      createEdge('p-images', 'p-out', '#06b6d4')
    ]
    return { nodes, edges, name: tr('Poppler 图文解构管线', 'Poppler text & image extraction') }
  }
  if (key === 'rapidocr') {
    const nodes = [
      createNode('input', { x: 50, y: 150 }, { id: 'ocr-in' }),
      createNode('ocr', { x: 320, y: 80 }, { id: 'ocr-sandwich' }),
      createNode('tables', { x: 320, y: 220 }, { id: 'ocr-table' }),
      createNode('output', { x: 620, y: 150 }, { id: 'ocr-out' })
    ]
    const edges = [
      createEdge('ocr-in', 'ocr-sandwich', '#f43f5e'),
      createEdge('ocr-in', 'ocr-table', '#10b981'),
      createEdge('ocr-sandwich', 'ocr-out', '#f43f5e'),
      createEdge('ocr-table', 'ocr-out', '#10b981')
    ]
    return { nodes, edges, name: tr('RapidOCR 双层 PDF 与表格还原管线', 'RapidOCR searchable PDF & table extraction') }
  }
  if (key === 'reorder') {
    const nodes = [
      createNode('input', { x: 50, y: 150 }, { id: 'r-in' }),
      createNode('reorder', { x: 320, y: 150 }, { id: 'r-reorder', params: { mode: 'reverse' } }),
      createNode('pageNumbers', { x: 590, y: 150 }, { id: 'r-numbers' }),
      createNode('output', { x: 860, y: 150 }, { id: 'r-out' })
    ]
    const edges = [
      createEdge('r-in', 'r-reorder', '#ec4899'),
      createEdge('r-reorder', 'r-numbers', '#ec4899'),
      createEdge('r-numbers', 'r-out', '#ec4899')
    ]
    return { nodes, edges, name: tr('页面倒序并重新编页码', 'Reverse pages & renumber') }
  }
  // 默认：企业保密合同流水线
  const nodes = [
    createNode('input', { x: 50, y: 150 }, { id: 'node-input' }),
    createNode('watermark', { x: 320, y: 80 }, { id: 'node-watermark', params: { text: tr('绝密 内部资料', 'CONFIDENTIAL') } }),
    createNode('bates', { x: 590, y: 80 }, { id: 'node-bates' }),
    createNode('popplerText', { x: 320, y: 230 }, { id: 'node-poppler' }),
    createNode('output', { x: 860, y: 150 }, { id: 'node-output' })
  ]
  const edges = [
    createEdge('node-input', 'node-watermark'),
    createEdge('node-watermark', 'node-bates'),
    createEdge('node-bates', 'node-output'),
    createEdge('node-input', 'node-poppler', '#10b981'),
    createEdge('node-poppler', 'node-output', '#10b981')
  ]
  return { nodes, edges, name: tr('企业保密合同一键流水线', 'Confidential contract pipeline') }
}

// ───────────────────────── 执行器辅助 ─────────────────────────

let workflowRunToken = 0

class WorkflowCancelled extends Error {}

function topologicalOrder(nodes: Node[], edges: Edge[]): Node[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  }

  const ready = nodes.filter((node) => indegree.get(node.id) === 0)
  const result: Node[] = []
  while (ready.length > 0) {
    const node = ready.shift()!
    result.push(node)
    for (const targetId of outgoing.get(node.id) || []) {
      const next = (indegree.get(targetId) || 0) - 1
      indegree.set(targetId, next)
      if (next === 0) {
        const target = nodes.find((candidate) => candidate.id === targetId)
        if (target) ready.push(target)
      }
    }
  }

  if (result.length !== nodes.length) {
    throw new Error(tr('工作流包含循环连线，请先修正后再运行。', 'The workflow contains a cycle. Please fix the connections first.'))
  }
  return result
}

/** 解析 "1-3,5,9-7" 形式的页码列表（1 起始，支持倒序区间） */
function parsePageList(input: string, maxPage?: number): number[] {
  const pages: number[] = []
  for (const raw of input.split(/[,，\s]+/)) {
    const token = raw.trim()
    if (!token) continue
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      const step = a <= b ? 1 : -1
      for (let p = a; step > 0 ? p <= b : p >= b; p += step) pages.push(p)
    } else if (/^\d+$/.test(token)) {
      pages.push(Number(token))
    } else {
      throw new Error(tr(`无法识别的页码：“${token}”`, `Invalid page token: "${token}"`))
    }
  }
  if (maxPage !== undefined) {
    const bad = pages.find((p) => p < 1 || p > maxPage)
    if (bad !== undefined) {
      throw new Error(tr(`页码 ${bad} 超出范围 (1-${maxPage})`, `Page ${bad} is out of range (1-${maxPage})`))
    }
  }
  return pages
}

const fileStem = (filePath: string) => filePath.replace(/\.pdf$/i, '')

interface WorkflowValue {
  pdfPath?: string
  pageCount?: number
  artifacts: string[]
}

interface OpResult {
  success: boolean
  outputPath?: string
  error?: string
  message?: string
  pageCount?: number
}

// ───────────────────────── Store ─────────────────────────

export interface WorkflowState {
  isOpen: boolean
  nodes: Node[]
  edges: Edge[]
  isRunning: boolean
  currentExecutingNodeId: string | null
  nodeStatus: Record<string, NodeStatus>
  executionLogs: string[]

  // Actions
  setIsOpen: (open: boolean) => void
  toggleOpen: () => void
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void
  loadTemplate: (templateKey: WorkflowTemplateKey) => void
  addNode: (operation: WorkflowOperation) => void
  updateNodeParams: (nodeId: string, patch: Record<string, ParamValue>) => void
  removeNode: (nodeId: string) => void
  removeEdge: (edgeId: string) => void
  runWorkflow: () => Promise<void>
  stopWorkflow: () => void
  addLog: (msg: string) => void
  clearLogs: () => void
}

const initialTemplate = buildTemplate('watermark')

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  isOpen: false,
  nodes: initialTemplate.nodes,
  edges: initialTemplate.edges,
  isRunning: false,
  currentExecutingNodeId: null,
  nodeStatus: {},
  executionLogs: [tr('工作流引擎已就绪。可从左侧面板添加节点并拖拽连线。', 'Workflow engine ready. Add nodes from the palette and drag to connect them.')],

  setIsOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setNodes: (updater) => set((s) => ({ nodes: typeof updater === 'function' ? updater(s.nodes) : updater })),
  setEdges: (updater) => set((s) => ({ edges: typeof updater === 'function' ? updater(s.edges) : updater })),

  loadTemplate: (templateKey) => {
    if (get().isRunning) return
    const { nodes, edges, name } = buildTemplate(templateKey)
    set({
      nodes,
      edges,
      nodeStatus: {},
      executionLogs: [tr(`已载入模板：【${name}】`, `Template loaded: ${name}`)]
    })
  },

  addNode: (operation) => {
    const { nodes, edges } = get()
    // 连接来源：优先当前选中节点，否则使用最后一个节点；输出节点不能作为来源，输入节点不能作为目标
    const selected = nodes.find((node) => node.selected)
    let source: Node | undefined = selected || nodes[nodes.length - 1]
    if (source && getNodeOperation(source) === 'output') {
      // 若来源是输出节点，改为接在其上游节点之后
      const upstream = edges.find((edge) => edge.target === source!.id)
      source = upstream ? nodes.find((node) => node.id === upstream.source) : undefined
    }

    const anchor = source || nodes[nodes.length - 1]
    let position = anchor
      ? { x: anchor.position.x + 270, y: anchor.position.y }
      : { x: 50, y: 150 }
    // 避免与已有节点重叠
    while (nodes.some((node) => Math.abs(node.position.x - position.x) < 120 && Math.abs(node.position.y - position.y) < 60)) {
      position = { x: position.x, y: position.y + 90 }
    }

    const node = { ...createNode(operation, position), selected: true }
    const newEdges = [...edges]
    if (source && operation !== 'input') {
      newEdges.push(createEdge(source.id, node.id, NODE_DEFINITIONS[operation].color))
    }
    set({
      nodes: [...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), node],
      edges: newEdges.map((e) => (e.selected ? { ...e, selected: false } : e))
    })
  },

  updateNodeParams: (nodeId, patch) =>
    set((s) => ({
      nodes: s.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, params: { ...getNodeParams(node), ...patch } } }
          : node
      )
    })),

  removeNode: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.filter((node) => node.id !== nodeId),
      edges: s.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    })),

  removeEdge: (edgeId) => set((s) => ({ edges: s.edges.filter((edge) => edge.id !== edgeId) })),

  runWorkflow: async () => {
    if (get().isRunning) return

    const token = ++workflowRunToken
    const { nodes, edges } = get()
    const docStore = useDocumentStore.getState()
    const activeTab = docStore.tabs.find((tab) => tab.id === docStore.activeTabId)

    const ensureActive = () => {
      if (token !== workflowRunToken) throw new WorkflowCancelled()
    }
    const setStatus = (nodeId: string, status: NodeStatus) =>
      set((s) => ({ nodeStatus: { ...s.nodeStatus, [nodeId]: status } }))

    set({
      isRunning: true,
      nodeStatus: {},
      executionLogs: [`🚀 ${tr('正在启动工作流...', 'Starting workflow...')}`]
    })
    const values = new Map<string, WorkflowValue>()
    // 用于生成默认保存文件名的基准路径（首个输入文档）
    let baseInputPath: string | undefined
    let currentNodeId: string | null = null
    let finalSavedPdf: string | undefined

    try {
      const orderedNodes = topologicalOrder(nodes, edges)
      if (!orderedNodes.some((node) => getNodeOperation(node) === 'input')) {
        throw new Error(tr('工作流缺少 PDF 输入节点。', 'The workflow has no Input PDF node.'))
      }
      if (!orderedNodes.some((node) => getNodeOperation(node) === 'output')) {
        throw new Error(tr('工作流缺少输出节点，无法保存处理结果。', 'The workflow has no Export node, results cannot be saved.'))
      }

      for (const node of orderedNodes) {
        ensureActive()
        currentNodeId = node.id
        const operation = getNodeOperation(node)
        const params = getNodeParams(node)
        const def = operation ? NODE_DEFINITIONS[operation] : null
        const label = def ? `${def.icon} ${t2(def.title)}` : node.id

        set({ currentExecutingNodeId: node.id })
        setStatus(node.id, 'running')
        get().addLog(`[${tr('执行中', 'Running')}] ${label}`)

        const inputValues = edges
          .filter((edge) => edge.target === node.id)
          .map((edge) => values.get(edge.source))
          .filter((value): value is WorkflowValue => Boolean(value))
        const upstream = inputValues.find((value) => value.pdfPath)
        const inputPdf = upstream?.pdfPath
        const combinedArtifacts = inputValues.flatMap((value) => value.artifacts)
        const defaultBase = fileStem(baseInputPath || inputPdf || 'output.pdf')

        const requirePdf = (): string => {
          if (!inputPdf) {
            throw new Error(tr(`节点“${label}”没有连接 PDF 输入。`, `Node "${label}" has no PDF input connected.`))
          }
          return inputPdf
        }
        const checkResult = (result: OpResult, fallback: string): string => {
          ensureActive()
          if (!result.success || !result.outputPath) {
            throw new Error(result.error || result.message || fallback)
          }
          return result.outputPath
        }
        /** 执行一个 PDF → PDF 的变换步骤，中间结果写入临时文件 */
        const runPdfStep = async (run: (src: string, outputPath: string) => Promise<OpResult>) => {
          const src = requirePdf()
          const outputPath = await window.electronAPI.getTempPdfPath(`pdfopen_workflow_${operation}`)
          const result = await run(src, outputPath)
          const out = checkResult(result, tr(`${label} 执行失败。`, `${label} failed.`))
          if (result.message) get().addLog(`   ${result.message}`)
          values.set(node.id, { pdfPath: out, pageCount: result.pageCount, artifacts: combinedArtifacts })
        }

        switch (operation) {
          case 'input': {
            let filePath: string | undefined
            let pageCount: number | undefined
            if (params.source !== 'pick' && activeTab) {
              filePath = activeTab.filePath
              pageCount = activeTab.pageCount
              if (!baseInputPath) baseInputPath = activeTab.originalFilePath || activeTab.filePath
            } else {
              if (params.source !== 'pick') {
                get().addLog(tr('未打开任何文档，请选择要处理的 PDF。', 'No document is open. Please choose a PDF to process.'))
              }
              const picked = await window.electronAPI.openFileDialog({ filters: [{ name: 'PDF', extensions: ['pdf'] }] })
              ensureActive()
              filePath = picked?.[0]
              if (!filePath) throw new Error(tr('已取消选择输入 PDF。', 'Input PDF selection was cancelled.'))
              if (!baseInputPath) baseInputPath = filePath
            }
            get().addLog(`   ${tr('输入', 'Input')}: ${filePath}`)
            values.set(node.id, { pdfPath: filePath, pageCount, artifacts: [] })
            break
          }
          case 'watermark': {
            const text = String(params.text || '').trim()
            if (!text) throw new Error(tr('水印文字不能为空。', 'Watermark text cannot be empty.'))
            await runPdfStep((src, out) =>
              window.electronAPI.addWatermark(
                src,
                {
                  text,
                  position: params.position as 'center' | 'tiled' | 'header' | 'footer',
                  opacity: Math.max(0, Math.min(1, Number(params.opacity) || 0.2)),
                  fontSize: Number(params.fontSize) || undefined,
                  rotation: Number(params.rotation) || 0,
                  color: String(params.color || '') || undefined
                },
                out
              )
            )
            break
          }
          case 'bates': {
            await runPdfStep((src, out) =>
              window.electronAPI.applyBatesNumbering(
                src,
                {
                  prefix: String(params.prefix ?? ''),
                  suffix: String(params.suffix ?? ''),
                  startNumber: Math.max(0, Math.floor(Number(params.startNumber) || 0)),
                  digits: Math.max(1, Math.min(12, Math.floor(Number(params.digits) || 6))),
                  position: params.position as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom-center',
                  fontSize: Number(params.fontSize) || undefined
                },
                out
              )
            )
            break
          }
          case 'rotate': {
            const pages = parsePageList(String(params.pages || ''))
            const angle = Number(params.angle) || 90
            await runPdfStep((src, out) => window.electronAPI.rotatePages(src, pages, angle, out))
            break
          }
          case 'reorder': {
            const src = requirePdf()
            // 页数：优先使用上游结果/活动标签页记录，否则读取文件
            let pageCount = upstream?.pageCount
            if (!pageCount) {
              const info = await window.electronAPI.readPDFFile(src)
              ensureActive()
              pageCount = info.metadata.pageCount
            }
            if (!pageCount) throw new Error(tr('无法获取文档页数。', 'Unable to determine the page count.'))
            const all = Array.from({ length: pageCount }, (_, i) => i + 1)
            let newOrder: number[]
            if (params.mode === 'custom') {
              newOrder = parsePageList(String(params.customOrder || ''), pageCount)
              if (newOrder.length === 0) throw new Error(tr('请填写自定义页面顺序。', 'Please enter a custom page order.'))
            } else if (params.mode === 'oddEven') {
              newOrder = [...all.filter((p) => p % 2 === 1), ...all.filter((p) => p % 2 === 0)]
            } else {
              newOrder = all.reverse()
            }
            await runPdfStep((s, out) => window.electronAPI.reorderPages(s, newOrder, out))
            const value = values.get(node.id)
            if (value) value.pageCount = newOrder.length
            break
          }
          case 'pageNumbers': {
            await runPdfStep((src, out) =>
              window.electronAPI.pdfAddPageNumbers(
                src,
                {
                  format: String(params.format || '{page} / {total}'),
                  position: params.position as 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left',
                  startPage: Math.max(0, Math.floor(Number(params.startPage) || 1)),
                  fontSize: Number(params.fontSize) || undefined,
                  skipFirstPage: Boolean(params.skipFirstPage)
                },
                out
              )
            )
            break
          }
          case 'compress': {
            const src = requirePdf()
            const outputPath = await window.electronAPI.getTempPdfPath('pdfopen_workflow_compress')
            const result = await window.electronAPI.pdfCompress(src, outputPath, params.level as CompressLevel)
            const out = checkResult(result, tr('压缩失败。', 'Compression failed.'))
            if (result.originalSize && result.compressedSize) {
              const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
              get().addLog(`   ${kb(result.originalSize)} → ${kb(result.compressedSize)}`)
            }
            values.set(node.id, { pdfPath: out, pageCount: upstream?.pageCount, artifacts: combinedArtifacts })
            break
          }
          case 'grayscale': {
            await runPdfStep((src, out) =>
              window.electronAPI.pythonGrayscaleInvert(src, out, params.mode === 'invert' ? 'invert' : 'grayscale')
            )
            break
          }
          case 'encrypt': {
            const userPassword = String(params.userPassword || '')
            const ownerPassword = String(params.ownerPassword || '')
            if (!userPassword && !ownerPassword) {
              throw new Error(tr('请至少设置打开密码或权限密码。', 'Please set an open password or an owner password.'))
            }
            await runPdfStep((src, out) =>
              window.electronAPI.encryptPDF(
                src,
                {
                  userPassword: userPassword || undefined,
                  ownerPassword: ownerPassword || userPassword,
                  permissions: {
                    printing: params.allowPrinting ? 'highResolution' : false,
                    copying: Boolean(params.allowCopying),
                    modifying: Boolean(params.allowModifying),
                    annotating: Boolean(params.allowModifying),
                    fillingForms: true,
                    contentAccessibility: true,
                    documentAssembly: Boolean(params.allowModifying)
                  }
                },
                out
              )
            )
            break
          }
          case 'ocr': {
            const src = requirePdf()
            const outputPath = await window.electronAPI.getTempPdfPath('pdfopen_workflow_ocr')
            const result = await window.electronAPI.pythonOcrSandwich(src, outputPath, Number(params.dpi) || 200)
            const out = checkResult(result, tr('OCR 处理失败。', 'OCR failed.'))
            values.set(node.id, { pdfPath: out, pageCount: result.pageCount, artifacts: combinedArtifacts })
            get().addLog(tr(`   OCR 完成，识别 ${result.totalWords || 0} 个词。`, `   OCR done, ${result.totalWords || 0} words recognized.`))
            break
          }
          case 'popplerText': {
            const src = requirePdf()
            const pageStart = Math.floor(Number(params.pageStart) || 0)
            const pageEnd = Math.floor(Number(params.pageEnd) || 0)
            const result = await window.electronAPI.popplerExtractText(src, {
              layout: Boolean(params.layout),
              pageStart: pageStart > 0 ? pageStart : undefined,
              pageEnd: pageEnd > 0 ? pageEnd : undefined
            })
            ensureActive()
            if (!result.success || result.text === undefined) {
              throw new Error(result.error || tr('文字提取失败。', 'Text extraction failed.'))
            }
            const outputPath = await window.electronAPI.saveFileDialog({
              defaultPath: `${defaultBase}_extracted.txt`,
              filters: [{ name: tr('文本文件', 'Text file'), extensions: ['txt'] }]
            })
            ensureActive()
            if (!outputPath) throw new Error(tr('已取消选择文本保存位置。', 'Text save location was cancelled.'))
            const saved = await window.electronAPI.writeTextFile(outputPath, result.text)
            if (!saved.success) throw new Error(saved.error || tr('保存提取文本失败。', 'Failed to save extracted text.'))
            const artifact = tr(`文本：${result.text.length} 个字符，文件 ${outputPath}`, `Text: ${result.text.length} chars, file ${outputPath}`)
            get().addLog(`   ${artifact}`)
            values.set(node.id, { pdfPath: src, pageCount: upstream?.pageCount, artifacts: [...combinedArtifacts, artifact] })
            break
          }
          case 'popplerImages': {
            const src = requirePdf()
            const selected = await window.electronAPI.openFileDialog({ openDirectory: true })
            ensureActive()
            const outputDir = selected?.[0]
            if (!outputDir) throw new Error(tr('已取消选择图片导出目录。', 'Image export folder selection was cancelled.'))
            const result = await window.electronAPI.popplerExtractImages(src, outputDir)
            ensureActive()
            if (!result.success) throw new Error(result.error || tr('图片提取失败。', 'Image extraction failed.'))
            const artifact = tr(`图片：${result.count || 0} 张，目录 ${outputDir}`, `Images: ${result.count || 0}, folder ${outputDir}`)
            get().addLog(`   ${artifact}`)
            values.set(node.id, { pdfPath: src, pageCount: upstream?.pageCount, artifacts: [...combinedArtifacts, artifact] })
            break
          }
          case 'tables': {
            const src = requirePdf()
            const pages = parsePageList(String(params.pages || ''))
            const outputPath = await window.electronAPI.saveFileDialog({
              defaultPath: `${defaultBase}_tables.xlsx`,
              filters: [{ name: tr('Excel 工作簿', 'Excel workbook'), extensions: ['xlsx'] }]
            })
            ensureActive()
            if (!outputPath) throw new Error(tr('已取消选择 Excel 保存位置。', 'Excel save location was cancelled.'))
            const result = await window.electronAPI.pythonExtractTables(src, outputPath, pages.length > 0 ? pages : undefined)
            const out = checkResult(result, tr('表格提取失败。', 'Table extraction failed.'))
            const artifact = tr(`Excel：${result.tableCount || 0} 个表格，文件 ${out}`, `Excel: ${result.tableCount || 0} tables, file ${out}`)
            get().addLog(`   ${artifact}`)
            values.set(node.id, { pdfPath: src, pageCount: upstream?.pageCount, artifacts: [...combinedArtifacts, artifact] })
            break
          }
          case 'output': {
            const pdfPaths = [...new Set(inputValues.map((value) => value.pdfPath).filter((value): value is string => Boolean(value)))]
            const artifacts = [...new Set(combinedArtifacts)]
            // 输入原文件路径集合：若最终 PDF 与输入一致，说明没有产生新的 PDF，无需另存
            const sourcePaths = new Set(
              orderedNodes
                .filter((n) => getNodeOperation(n) === 'input')
                .map((n) => values.get(n.id)?.pdfPath)
                .filter(Boolean)
            )
            const finalPdf = pdfPaths.find((filePath) => !sourcePaths.has(filePath)) || pdfPaths[pdfPaths.length - 1]
            if (finalPdf && !sourcePaths.has(finalPdf)) {
              const outputPath = await window.electronAPI.saveFileDialog({
                defaultPath: `${defaultBase}${String(params.suffix ?? '_workflow')}.pdf`,
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
              })
              ensureActive()
              if (!outputPath) throw new Error(tr('已取消选择 PDF 导出位置。', 'PDF export location was cancelled.'))
              const saved = await window.electronAPI.saveCurrentFile(finalPdf, outputPath)
              if (!saved.success) throw new Error(saved.error || tr('保存工作流 PDF 失败。', 'Failed to save the workflow PDF.'))
              finalSavedPdf = outputPath
              artifacts.push(`PDF: ${outputPath}`)
              if (params.openAfter) {
                const opened = await useDocumentStore.getState().openDocument(outputPath)
                if (!opened) get().addLog(tr('⚠️ 结果已保存，但无法在阅读器中打开（可能已加密）。', '⚠️ Saved, but the result could not be opened in the viewer (it may be encrypted).'))
              }
            }
            for (const artifact of artifacts) get().addLog(`${tr('结果', 'Result')}: ${artifact}`)
            values.set(node.id, { pdfPath: finalPdf, artifacts })
            break
          }
          default:
            throw new Error(tr(`节点“${label}”没有可执行的操作类型。`, `Node "${label}" has no executable operation type.`))
        }

        ensureActive()
        setStatus(node.id, 'success')
      }

      ensureActive()
      get().addLog(`✅ ${tr('工作流已完成，以上日志列出了实际生成的文件和操作结果。', 'Workflow completed. The log above lists the generated files and results.')}`)
      toast.success(tr('工作流已完成', 'Workflow completed'), finalSavedPdf, finalSavedPdf)
    } catch (error: any) {
      if (error instanceof WorkflowCancelled || token !== workflowRunToken) return
      if (currentNodeId) setStatus(currentNodeId, 'error')
      const message = error?.message || String(error)
      get().addLog(`❌ ${tr('工作流失败', 'Workflow failed')}: ${message}`)
      toast.error(tr('工作流失败', 'Workflow failed'), message)
    } finally {
      if (token === workflowRunToken) {
        set({ isRunning: false, currentExecutingNodeId: null })
      }
    }
  },

  stopWorkflow: () => {
    workflowRunToken++
    const running = get().currentExecutingNodeId
    set((s) => {
      const nodeStatus = { ...s.nodeStatus }
      if (running && nodeStatus[running] === 'running') delete nodeStatus[running]
      return { isRunning: false, currentExecutingNodeId: null, nodeStatus }
    })
    get().addLog(
      `⏹ ${tr(
        '已停止工作流；当前正在执行的系统操作完成后不会继续调度后续节点。',
        'Workflow stopped. The operation in progress will finish, but no further nodes will run.'
      )}`
    )
  },

  addLog: (msg) => set((s) => ({ executionLogs: [...s.executionLogs, `[${new Date().toLocaleTimeString()}] ${msg}`] })),
  clearLogs: () => set({ executionLogs: [] })
}))
